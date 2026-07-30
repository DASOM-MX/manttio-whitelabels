import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { customers } from '../../customers/models/customers.model';
import { customerContacts } from '../../customers/models/customer-contacts.model';
import { users } from '../../users/models/users.model';
import { quotationCounters, quotations } from '../models/quotations.model';
import { quotationLines } from '../models/quotation-lines.model';
import { quotationRecipients } from '../models/quotation-recipients.model';
import { quotationEvents } from '../models/quotation-events.model';
import { QuotationEventRefKind, QuotationEventType, QuotationStatus } from '../enums/quotations.enum';
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
  UpdateQuotationFields,
} from '../types/quotations.types';

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
  filters: { search?: string; customerId?: string; status?: QuotationStatus },
  page: number,
  limit: number,
): Promise<{ items: { quotation: QuotationRow; customerName: string }[]; total: number }> => {
  const conds = [activeFilter];
  if (filters.customerId) conds.push(eq(quotations.customerId, filters.customerId));
  if (filters.status) conds.push(eq(quotations.status, filters.status));
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

  return { items, total: totalRow?.value ?? 0 };
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
export const recordResponseAndDeriveStatus = async (
  db: Db,
  args: {
    recipient: QuotationRecipientRow;
    response: QuotationRecipientRow['response'];
    reason: string | null;
    nextStatus: QuotationStatus;
    previousStatus: QuotationStatus;
    tally: QuotationTally;
  },
): Promise<QuotationRow | null> =>
  db.transaction(async (tx) => {
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
    return row;
  });

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
