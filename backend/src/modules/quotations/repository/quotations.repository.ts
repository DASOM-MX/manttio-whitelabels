import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { customers } from '../../customers/models/customers.model';
import { customerContacts } from '../../customers/models/customer-contacts.model';
import { users } from '../../users/models/users.model';
import { quotationCounters, quotations } from '../models/quotations.model';
import { quotationSettings } from '../models/quotation-settings.model';
import { customerInteractions } from '../../customers/models/customer-interactions.model';
import { InteractionRefKind, InteractionType } from '../../customers/enums/interactions.enum';
import { quotationLines } from '../models/quotation-lines.model';
import { quotationRecipients } from '../models/quotation-recipients.model';
import { quotationEvents } from '../models/quotation-events.model';
import { serviceOrders } from '../../service-orders/models/service-orders.model';
import { LIVE_STATUSES, QuotationEventRefKind, QuotationEventType, QuotationStatus } from '../enums/quotations.enum';
import { folioDayKey, formatQuotationFolio } from '../utils/quotation-folio';
import type { QuotationTally } from '../utils/quotation-status';
import type {
  NewQuotation,
  NewQuotationEvent,
  NewQuotationLine,
  NewQuotationRecipient,
  QuotationEventRow,
  QuotationLineRow,
  QuotationRecipientRow,
  QuotationRow,
  QuotationWithCustomer,
  UpdateQuotationFields,
} from '../types/quotations.types';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';

// Anything that can run a query: the pool client, or a transaction handle.
// Event appends and status writes are called from both — inside a transaction
// when they accompany a state change (the common case, and the rule in 20 §5),
// standalone only where there is genuinely nothing to be atomic with.
type QueryRunner = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

const activeFilter = isNull(quotations.deletedAt);

/** Append-only, and the only way events are ever written — there is no update
 *  or delete counterpart anywhere in this module by design (20 §5).
 *
 *  Always takes an array and always emits **one** multi-row INSERT: a quote
 *  with 20 lines opens with 21 events, and awaiting them one at a time would be
 *  21 sequential round trips to Neon inside the transaction that holds the
 *  folio counter — the single hottest lock in the module. */
export const appendEvents = async (
  runner: QueryRunner,
  events: NewQuotationEvent[],
): Promise<void> => {
  if (events.length === 0) return;
  await runner.insert(quotationEvents).values(events);
};

/** Folio counter → header → lines → opening events, on a caller-supplied
 *  runner so it can be composed into a larger transaction (see
 *  `reviseQuotation`). Four statements regardless of line count. */
const insertQuotationWithLines = async (
  tx: QueryRunner,
  header: Omit<NewQuotation, 'folio'>,
  lines: Omit<NewQuotationLine, 'quotationId'>[],
  actorId: string,
  day: Date,
): Promise<{ quotation: QuotationRow; lines: QuotationLineRow[] }> => {
  const [counter] = await tx
    .insert(quotationCounters)
    .values({ day: folioDayKey(day), lastNumber: 1 })
    .onConflictDoUpdate({
      target: quotationCounters.day,
      set: { lastNumber: sql`${quotationCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: quotationCounters.lastNumber });
  if (!counter) throw new Error('createQuotation: counter upsert returned no row');

  const [quotation] = await tx
    .insert(quotations)
    .values({ ...header, folio: formatQuotationFolio(day, counter.lastNumber) })
    .returning();
  if (!quotation) throw new Error('createQuotation: header insert returned no row');

  const lineRows = await tx
    .insert(quotationLines)
    .values(lines.map((line) => ({ ...line, quotationId: quotation.id })))
    .returning();

  await appendEvents(tx, [
    {
      quotationId: quotation.id,
      type: QuotationEventType.Created,
      actorId,
      changes: { folio: quotation.folio, lines: lineRows.length },
    },
    ...lineRows.map((line) => ({
      quotationId: quotation.id,
      type: QuotationEventType.LineAdded,
      actorId,
      refKind: QuotationEventRefKind.Quotation,
      changes: {
        serviceName: line.serviceName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
      },
    })),
  ]);

  return { quotation, lines: lineRows };
};

/** Atomic create: a quote can never exist without its lines or its
 *  `quotation_created` entry. */
export const createQuotation = async (
  db: Db,
  header: Omit<NewQuotation, 'folio'>,
  lines: Omit<NewQuotationLine, 'quotationId'>[],
  actorId: string,
  day: Date = new Date(),
): Promise<{ quotation: QuotationRow; lines: QuotationLineRow[] }> =>
  db.transaction((tx) => insertQuotationWithLines(tx, header, lines, actorId, day));

/** Revise (20 §2): a new linked draft *and* the cancellation of the quote it
 *  supersedes, in **one** transaction. Splitting them would allow the failure
 *  mode where a successor exists while the original is still live — two open
 *  quotes for the same work, which is precisely the ambiguity the revision
 *  chain exists to prevent. */
export const reviseQuotation = async (
  db: Db,
  args: {
    previousId: string;
    header: Omit<NewQuotation, 'folio'>;
    lines: Omit<NewQuotationLine, 'quotationId'>[];
    actorId: string;
    note: string;
    day?: Date;
  },
): Promise<{ quotation: QuotationRow; lines: QuotationLineRow[] }> =>
  db.transaction(async (tx) => {
    const created = await insertQuotationWithLines(
      tx,
      { ...args.header, supersedesQuotationId: args.previousId },
      args.lines,
      args.actorId,
      args.day ?? new Date(),
    );
    const now = new Date();
    await tx
      .update(quotations)
      .set({
        status: QuotationStatus.Cancelled,
        cancelledAt: now,
        resolutionReason: args.note,
        resolvedByUserId: args.actorId,
        updatedAt: now,
      })
      .where(and(eq(quotations.id, args.previousId), activeFilter));
    await appendEvents(tx, [
      {
        quotationId: args.previousId,
        type: QuotationEventType.Cancelled,
        actorId: args.actorId,
        refKind: QuotationEventRefKind.Quotation,
        refId: created.quotation.id,
        note: args.note,
      },
    ]);
    return created;
  });

export const findQuotationById = async (db: Db, id: string): Promise<QuotationRow | null> => {
  const [row] = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, id), activeFilter))
    .limit(1);
  return row ?? null;
};

export const findQuotationWithCustomer = async (
  db: Db,
  id: string,
): Promise<{ quotation: QuotationRow; customerName: string } | null> => {
  const [row] = await db
    .select({ quotation: quotations, customerName: customers.name })
    .from(quotations)
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .where(and(eq(quotations.id, id), activeFilter))
    .limit(1);
  return row ?? null;
};

/** Replaces a draft's line set wholesale (see `UpdateQuotationFields`), in one
 *  transaction with the header patch so the quote is never briefly line-less. */
export const updateQuotationDraft = async (
  db: Db,
  id: string,
  fields: UpdateQuotationFields,
  lines: Omit<NewQuotationLine, 'quotationId'>[] | null,
): Promise<QuotationRow | null> =>
  db.transaction(async (tx) => {
    const [row] = await tx
      .update(quotations)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(quotations.id, id), activeFilter))
      .returning();
    if (!row) return null;

    if (lines) {
      // The only hard delete in the module, and deliberately so: draft lines
      // are not a domain entity with history — they are the editable body of an
      // unsent document, and nobody has seen them. The no-hard-delete rule
      // guards records someone could rely on; a draft's scratch lines are not
      // that. Every line that ever reached a client sits on a sent quote, which
      // can no longer be patched.
      await tx.delete(quotationLines).where(eq(quotationLines.quotationId, id));
      await tx.insert(quotationLines).values(lines.map((line) => ({ ...line, quotationId: id })));
    }
    return row;
  });

export const listLinesForQuotations = async (
  db: Db,
  quotationIds: string[],
): Promise<QuotationLineRow[]> => {
  if (quotationIds.length === 0) return [];
  return db
    .select()
    .from(quotationLines)
    .where(inArray(quotationLines.quotationId, quotationIds))
    .orderBy(asc(quotationLines.createdAt));
};

/** Recipients joined to their contact, for the staff view and for the tally.
 *  Bulk-shaped (an id array) so a list page costs one query rather than one per
 *  row. */
export const listRecipientsForQuotations = async (
  db: Db,
  quotationIds: string[],
): Promise<{ recipient: QuotationRecipientRow; contactName: string | null }[]> => {
  if (quotationIds.length === 0) return [];
  return db
    .select({ recipient: quotationRecipients, contactName: customerContacts.name })
    .from(quotationRecipients)
    .leftJoin(customerContacts, eq(customerContacts.id, quotationRecipients.contactId))
    .where(inArray(quotationRecipients.quotationId, quotationIds))
    .orderBy(asc(quotationRecipients.sentAt));
};

export const listQuotations = async (
  db: Db,
  filters: {
    search?: string;
    customerId?: string;
    status?: QuotationStatus;
    due?: 'soon' | 'overdue';
  },
  page: number,
  limit: number,
): Promise<GenericQueryResponse<QuotationWithCustomer>> => {
  const conds = [activeFilter];
  if (filters.customerId) conds.push(eq(quotations.customerId, filters.customerId));
  if (filters.status) conds.push(eq(quotations.status, filters.status));
  if (filters.due) {
    // Vigencia lens (PR-C): only LIVE quotes — an expired cancelled quote is
    // trivia, the same reasoning as the list's Vencida tag. Calendar-date
    // strings compare lexicographically = chronologically.
    const today = new Date().toISOString().slice(0, 10);
    conds.push(inArray(quotations.status, LIVE_STATUSES));
    if (filters.due === 'overdue') {
      conds.push(sql`${quotations.validUntil} < ${today}`);
    } else {
      const horizon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      conds.push(sql`${quotations.validUntil} >= ${today}`);
      conds.push(sql`${quotations.validUntil} <= ${horizon}`);
    }
  }
  if (filters.search) {
    const q = `%${filters.search}%`;
    // Folio or client name — the two things anyone actually has to hand when
    // hunting for a quote.
    const match = or(ilike(quotations.folio, q), ilike(customers.name, q));
    if (match) conds.push(match);
  }
  const where = and(...conds);

  const [items, [totalRow]] = await Promise.all([
    db
      .select({ quotation: quotations, customerName: customers.name })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .where(where)
      .orderBy(desc(quotations.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ value: count() })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .where(where),
  ]);

  return { items, total: totalRow?.value ?? 0, page, limit };
};

/** Upsert on (quotationId, contactId): a re-send updates the existing row and
 *  keeps its token, so a link already in the recipient's inbox stays valid
 *  (owner 2026-07-26). `isReviewer` and the mailed address are refreshed; the
 *  response columns are deliberately untouched — a re-send must not erase an
 *  answer someone already gave. One statement for the whole recipient list. */
export const upsertRecipients = async (
  db: Db,
  rows: NewQuotationRecipient[],
): Promise<QuotationRecipientRow[]> => {
  if (rows.length === 0) return [];
  return db
    .insert(quotationRecipients)
    .values(rows)
    .onConflictDoUpdate({
      target: [quotationRecipients.quotationId, quotationRecipients.contactId],
      set: {
        email: sql`excluded.email`,
        isReviewer: sql`excluded.is_reviewer`,
        sentAt: new Date(),
      },
    })
    .returning();
};

export const findRecipientByToken = async (
  db: Db,
  token: string,
): Promise<{
  recipient: QuotationRecipientRow;
  quotation: QuotationRow;
  customerName: string;
  contactName: string | null;
} | null> => {
  const [row] = await db
    .select({
      recipient: quotationRecipients,
      quotation: quotations,
      customerName: customers.name,
      contactName: customerContacts.name,
    })
    .from(quotationRecipients)
    .innerJoin(quotations, eq(quotations.id, quotationRecipients.quotationId))
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .leftJoin(customerContacts, eq(customerContacts.id, quotationRecipients.contactId))
    .where(and(eq(quotationRecipients.token, token), activeFilter))
    .limit(1);
  return row ?? null;
};

/** First open only — a no-op once stamped. This is a delivery signal ("they got
 *  it"), not analytics; re-stamping on every reload would turn it into a
 *  last-seen field nobody asked for. The `isNull` guard makes it idempotent in
 *  one statement rather than a read-then-write race. */
export const markRecipientViewed = async (db: Db, recipientId: string): Promise<boolean> => {
  const [row] = await db
    .update(quotationRecipients)
    .set({ viewedAt: new Date() })
    .where(and(eq(quotationRecipients.id, recipientId), isNull(quotationRecipients.viewedAt)))
    .returning({ id: quotationRecipients.id });
  return !!row;
};

/** Records (or replaces) a reviewer's answer and re-derives the quote's status
 *  in the same transaction, appending one event per response — mind-changes
 *  included — plus a status-derive event when the tally actually moves. Both
 *  events go in a single insert. */
/** The CRM hook (08, PR-C): a `system` entry on the CLIENT's timeline written
 *  in the same transaction as the quote mutation it narrates. Complementary to
 *  `quotation_events`, not a duplicate — one answers "what happened with this
 *  client", the other "what happened on this quote". */
export interface QuotationInteraction {
  customerId: string;
  body: string;
  refId: string;
  userId: string | null;
}

const insertQuotationInteraction = (tx: Parameters<Parameters<Db['transaction']>[0]>[0], i: QuotationInteraction) =>
  tx.insert(customerInteractions).values({
    customerId: i.customerId,
    type: InteractionType.System,
    body: i.body,
    refKind: InteractionRefKind.Quotation,
    refId: i.refId,
    userId: i.userId,
  });

export const recordResponseAndDeriveStatus = async (
  db: Db,
  args: {
    recipient: QuotationRecipientRow;
    response: QuotationRecipientRow['response'];
    reason: string | null;
    nextStatus: QuotationStatus;
    previousStatus: QuotationStatus;
    tally: QuotationTally;
    interaction?: QuotationInteraction;
  },
): Promise<QuotationRow | null> =>
  db.transaction(async (tx) => {
    if (args.interaction) await insertQuotationInteraction(tx, args.interaction);
    await tx
      .update(quotationRecipients)
      .set({ response: args.response, responseReason: args.reason, respondedAt: new Date() })
      .where(eq(quotationRecipients.id, args.recipient.id));

    const events: NewQuotationEvent[] = [
      {
        quotationId: args.recipient.quotationId,
        type: QuotationEventType.ReviewerResponded,
        contactId: args.recipient.contactId,
        refKind: QuotationEventRefKind.Recipient,
        refId: args.recipient.id,
        changes: { response: args.response, previousResponse: args.recipient.response },
        note: args.reason,
      },
    ];
    if (args.nextStatus !== args.previousStatus) {
      events.push({
        quotationId: args.recipient.quotationId,
        type: QuotationEventType.StatusDerived,
        contactId: args.recipient.contactId,
        changes: { from: args.previousStatus, to: args.nextStatus, tally: args.tally },
      });
    }
    await appendEvents(tx, events);

    const [row] = await tx
      .update(quotations)
      .set({ status: args.nextStatus, updatedAt: new Date() })
      .where(and(eq(quotations.id, args.recipient.quotationId), activeFilter))
      .returning();
    return row ?? null;
  });

/** Status write + its events, atomically. Used by send and cancel; the same
 *  shape 19 will use for the conversion. */
export const setQuotationStatus = async (
  db: Db,
  id: string,
  fields: Partial<QuotationRow>,
  events: Omit<NewQuotationEvent, 'quotationId'>[],
  interaction?: QuotationInteraction,
): Promise<QuotationRow | null> =>
  db.transaction(async (tx) => {
    const [row] = await tx
      .update(quotations)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(quotations.id, id), activeFilter))
      .returning();
    if (!row) return null;
    await appendEvents(
      tx,
      events.map((event) => ({ ...event, quotationId: id })),
    );
    if (interaction) await insertQuotationInteraction(tx, interaction);
    return row;
  });

/** Tenant defaults (PR-C). Read tolerates the row not existing yet — the
 *  defaults of the defaults are empty strings. */
export const getQuotationSettings = async (db: Db): Promise<{ defaultComments: string }> => {
  const [row] = await db.select().from(quotationSettings).limit(1);
  return { defaultComments: row?.defaultComments ?? '' };
};

export const saveQuotationSettings = async (
  db: Db,
  defaultComments: string,
  userId: string,
): Promise<{ defaultComments: string }> => {
  const [row] = await db
    .insert(quotationSettings)
    .values({ id: 'default', defaultComments, updatedBy: userId })
    .onConflictDoUpdate({
      target: quotationSettings.id,
      set: { defaultComments, updatedAt: new Date(), updatedBy: userId },
    })
    .returning();
  return { defaultComments: row?.defaultComments ?? '' };
};

/** The timeline in **insertion order** (`seq`, never `created_at` — a batch
 *  shares one timestamp), with actor and contact names resolved so the UI
 *  renders a sentence per row without a lookup table. */
export const listQuotationEvents = async (
  db: Db,
  quotationId: string,
): Promise<{ event: QuotationEventRow; actorName: string | null; contactName: string | null }[]> =>
  db
    .select({
      event: quotationEvents,
      actorName: users.name,
      contactName: customerContacts.name,
    })
    .from(quotationEvents)
    .leftJoin(users, eq(users.id, quotationEvents.actorId))
    .leftJoin(customerContacts, eq(customerContacts.id, quotationEvents.contactId))
    .where(eq(quotationEvents.quotationId, quotationId))
    .orderBy(asc(quotationEvents.seq));

/** Audited soft delete + its event, atomically. Soft delete is the only removal
 *  mechanism in this codebase; the row and its whole timeline stay, and every
 *  read path drops it via `isNull(deletedAt)` — including
 *  `findRecipientByToken`, so a recipient's link stops resolving the moment the
 *  quote is tombstoned. */
/** The live quotations on a service request that already produced a **live**
 *  service order — what blocks a portal cancel (client-portal 06 §3, owner
 *  2026-09-03). A soft-deleted order does not block: it is history, and leaving
 *  the customer unable to withdraw because of one would be a dead end.
 *
 *  Returns the order folios, so the refusal can name what to cancel first. */
export const findOrderedQuotationsForServiceRequest = async (
  runner: QueryRunner,
  serviceRequestId: string,
): Promise<string[]> => {
  const rows = await runner
    .select({ orderFolio: serviceOrders.folio })
    .from(quotations)
    .innerJoin(serviceOrders, eq(serviceOrders.id, quotations.serviceOrderId))
    .where(
      and(
        eq(quotations.serviceRequestId, serviceRequestId),
        activeFilter,
        isNull(serviceOrders.deletedAt),
      ),
    );
  return rows.map((row) => row.orderFolio);
};

/**
 * Soft-delete every live quotation hanging off a service request, in the
 * caller's transaction — the cascade a portal cancel runs (client-portal 06 §3,
 * owner 2026-09-03). Application-level, never `ON DELETE CASCADE`.
 *
 * `deletedBy` stays null: that column references `users.id` and a portal cancel
 * has no staff actor. Attribution is the event's `contactId`, the same side of
 * `quotation_events` the portal's own reads and downloads write to.
 *
 * Returns the ids it removed, so the caller can report the blast radius.
 */
export const softDeleteQuotationsForServiceRequest = async (
  runner: QueryRunner,
  serviceRequestId: string,
  deleteComment: string,
  contactId: string,
): Promise<string[]> => {
  const now = new Date();
  const rows = await runner
    .update(quotations)
    .set({ deletedAt: now, updatedAt: now, deleteComment })
    .where(and(eq(quotations.serviceRequestId, serviceRequestId), activeFilter))
    .returning({ id: quotations.id });
  if (!rows.length) return [];

  await appendEvents(
    runner,
    rows.map((row) => ({
      quotationId: row.id,
      type: QuotationEventType.Deleted,
      actorId: null,
      contactId,
      refKind: null,
      refId: null,
      note: deleteComment,
    })),
  );

  return rows.map((row) => row.id);
};

export const softDeleteQuotation = async (
  db: Db,
  id: string,
  deleteComment: string,
  deletedBy: string,
): Promise<{ id: string } | null> =>
  db.transaction(async (tx) => {
    const now = new Date();
    const [row] = await tx
      .update(quotations)
      .set({ deletedAt: now, updatedAt: now, deleteComment, deletedBy })
      .where(and(eq(quotations.id, id), activeFilter))
      .returning({ id: quotations.id });
    if (!row) return null;
    await appendEvents(tx, [
      {
        quotationId: id,
        type: QuotationEventType.Deleted,
        actorId: deletedBy,
        note: deleteComment,
      },
    ]);
    return row;
  });
