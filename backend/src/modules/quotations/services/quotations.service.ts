import type { Db } from '../../database/client';
import type { Env } from '../../../env';
import { findServicesByIds } from '../../services/repository/services.repository';
import { findContactsForCustomer } from '../../customers/repository/customers.repository';
import { getBrand } from '../../brand/services/brand.service';
import { sendEmail } from '../../email/services/email.service';
import { generateAccessToken } from '../../reports/utils/access-token';
import {
  QuotationEventRefKind,
  QuotationEventType,
  QuotationResponse,
  QuotationStatus,
  isLiveStatus,
  isTallyStatus,
} from '../enums/quotations.enum';
import {
  InvalidRecipientError,
  NotAReviewerError,
  QuotationClosedError,
  QuotationDiscountTooLargeError,
  QuotationNotDraftError,
  QuotationNotLiveError,
  QuotationServiceNotFoundError,
} from '../http-errors/quotations.error';
import {
  appendEvents,
  createQuotation,
  findQuotationWithCustomer,
  findRecipientByToken,
  listLinesForQuotations,
  listQuotationEvents,
  listQuotations,
  listRecipientsForQuotations,
  markRecipientViewed,
  recordResponseAndDeriveStatus,
  reviseQuotation as reviseQuotationRows,
  setQuotationStatus,
  softDeleteQuotation,
  updateQuotationDraft,
  upsertRecipients,
} from '../repository/quotations.repository';
import { deriveStatus, tallyOf } from '../utils/quotation-status';
import { discountExceedsLine, lineSubtotal, quotationTotals } from '../utils/quotation-totals';
import {
  renderQuotationEmailHTML,
  renderQuotationEmailSubject,
  renderQuotationEmailText,
} from '../helpers/quotation-email.helpers';
import { renderQuotationPDF } from '../helpers/quotation-pdf.helpers';
import type {
  NewQuotationLine,
  PublicQuotationDTO,
  QuotationDetailDTO,
  QuotationEventDTO,
  QuotationLineDTO,
  QuotationLineRow,
  QuotationRecipientDTO,
  QuotationRecipientRow,
  QuotationRow,
  QuotationSummaryDTO,
} from '../types/quotations.types';
import type {
  CreateQuotationInput,
  ListQuotationsQuery,
  QuotationLineInput,
  RespondQuotationInput,
  SendQuotationInput,
  UpdateQuotationInput,
} from '../validators/quotations.validator';

const opt = <T>(v: T | null | undefined): T | undefined => v ?? undefined;

/** Uint8Array → base64 without Buffer, chunked so a multi-page PDF can't blow
 *  the argument-spread limit. */
const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

/** Overdue is computed, never stored (owner 2026-07-26): a column would be
 *  stale for up to a day and there is no cron to refresh it. Both operands are
 *  ISO calendar dates, so a lexicographic compare is also a chronological one —
 *  and it sidesteps constructing a `Date`, which would drag the server's
 *  timezone into a question that is purely about calendar days. */
export const isOverdue = (validUntil: string): boolean =>
  validUntil < new Date().toISOString().slice(0, 10);

const toLineDTO = (row: QuotationLineRow): QuotationLineDTO => ({
  id: row.id,
  serviceId: opt(row.serviceId),
  serviceName: row.serviceName,
  description: opt(row.description),
  unitPrice: row.unitPrice,
  uom: row.uom,
  taxRate: row.taxRate,
  quantity: row.quantity,
  discountAmount: row.discountAmount,
  lineSubtotal: lineSubtotal(row),
});

const toRecipientDTO = (
  row: QuotationRecipientRow,
  contactName: string | null,
): QuotationRecipientDTO => ({
  id: row.id,
  contactId: row.contactId,
  contactName: opt(contactName),
  email: row.email,
  isReviewer: row.isReviewer,
  sentAt: row.sentAt.toISOString(),
  viewedAt: opt(row.viewedAt?.toISOString()),
  respondedAt: opt(row.respondedAt?.toISOString()),
  response: opt(row.response),
  responseReason: opt(row.responseReason),
  // `token` is deliberately absent — it is one contact's bearer secret and the
  // staff UI has no use for it.
});

const toSummaryDTO = (
  row: QuotationRow,
  customerName: string,
  lines: QuotationLineRow[],
  recipients: QuotationRecipientRow[],
): QuotationSummaryDTO => ({
  id: row.id,
  folio: row.folio,
  customerId: row.customerId,
  customerName,
  status: row.status,
  validUntil: row.validUntil,
  isOverdue: isOverdue(row.validUntil),
  total: quotationTotals(lines).total,
  tally: tallyOf(recipients.filter((r) => r.isReviewer)),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toDetailDTO = (
  row: QuotationRow,
  customerName: string,
  lines: QuotationLineRow[],
  recipients: { recipient: QuotationRecipientRow; contactName: string | null }[],
): QuotationDetailDTO => ({
  ...toSummaryDTO(
    row,
    customerName,
    lines,
    recipients.map((r) => r.recipient),
  ),
  comments: opt(row.comments),
  supersedesQuotationId: opt(row.supersedesQuotationId),
  sentAt: opt(row.sentAt?.toISOString()),
  resolutionReason: opt(row.resolutionReason),
  cancelledAt: opt(row.cancelledAt?.toISOString()),
  orderCreatedAt: opt(row.orderCreatedAt?.toISOString()),
  resolvedByUserId: opt(row.resolvedByUserId),
  serviceOrderId: opt(row.serviceOrderId),
  createdBy: row.createdBy,
  lines: lines.map(toLineDTO),
  recipients: recipients.map((r) => toRecipientDTO(r.recipient, r.contactName)),
  totals: quotationTotals(lines),
});

/** Resolves every line's snapshot (18 → 20) — catalog lines from `services` in
 *  **one** query, off-catalog lines (decided 2026-07-29, no `serviceId`) from
 *  the staff-typed fields, which ARE their snapshot. For a catalog line the
 *  client still sends only `serviceId` + `quantity`: accepting a price there
 *  would let a quote carry one the catalog never held, which defeats the freeze
 *  the whole module is built on.
 *
 *  `clampDiscount` is the **revise** path only: re-resolving can land a new
 *  catalog price *below* a frozen discount, and revise has no body to fix it
 *  with — so the discount clamps to the new importe (a visibly free line on an
 *  editable draft) instead of the whole revise hard-failing. Create/update
 *  throw instead: there the builder can fix the row. */
const resolveLines = async (
  db: Db,
  inputs: QuotationLineInput[],
  opts: { clampDiscount?: boolean } = {},
): Promise<Omit<NewQuotationLine, 'quotationId'>[]> => {
  const catalogIds = [...new Set(inputs.flatMap((l) => (l.serviceId ? [l.serviceId] : [])))];
  const rows = catalogIds.length ? await findServicesByIds(db, catalogIds) : [];
  const byId = new Map(rows.map((s) => [s.id, s]));
  return inputs.map((input) => {
    let snapshot: Omit<NewQuotationLine, 'quotationId' | 'quantity' | 'discountAmount'>;
    if (input.serviceId) {
      const service = byId.get(input.serviceId);
      // Missing means absent or soft-deleted — either way it can't be quoted.
      if (!service) throw new QuotationServiceNotFoundError(input.serviceId);
      snapshot = {
        serviceId: service.id,
        serviceName: service.name,
        description: input.description ?? service.description,
        unitPrice: service.price,
        uom: service.uom,
        taxRate: service.taxRate,
      };
    } else {
      // The validator has already required all four; the non-null assertions
      // restate its contract, they don't extend it.
      snapshot = {
        serviceId: null,
        serviceName: input.name!,
        description: input.description ?? null,
        unitPrice: input.unitPrice!,
        uom: input.uom!,
        taxRate: input.taxRate!,
      };
    }
    const line = {
      ...snapshot,
      quantity: input.quantity,
      discountAmount: input.discountAmount ?? '0.00',
    };
    if (discountExceedsLine(line)) {
      if (!opts.clampDiscount) throw new QuotationDiscountTooLargeError(line.serviceName);
      line.discountAmount = lineSubtotal(line);
    }
    return line;
  });
};

/** Loads a quote with everything the detail DTO needs — three queries, never
 *  one per line or per recipient. */
const loadDetail = async (db: Db, id: string): Promise<QuotationDetailDTO | null> => {
  const found = await findQuotationWithCustomer(db, id);
  if (!found) return null;
  const [lines, recipients] = await Promise.all([
    listLinesForQuotations(db, [id]),
    listRecipientsForQuotations(db, [id]),
  ]);
  return toDetailDTO(found.quotation, found.customerName, lines, recipients);
};

export const getQuotations = async (
  db: Db,
  query: ListQuotationsQuery,
): Promise<{ items: QuotationSummaryDTO[]; total: number }> => {
  const { items, total } = await listQuotations(
    db,
    { search: query.q, customerId: query.customerId, status: query.status },
    query.page,
    query.limit,
  );
  const ids = items.map((i) => i.quotation.id);
  // Two bulk queries for the whole page — the alternative is 2N round trips.
  const [lines, recipients] = await Promise.all([
    listLinesForQuotations(db, ids),
    listRecipientsForQuotations(db, ids),
  ]);
  const linesByQuotation = new Map<string, QuotationLineRow[]>();
  for (const line of lines) {
    const bucket = linesByQuotation.get(line.quotationId);
    if (bucket) bucket.push(line);
    else linesByQuotation.set(line.quotationId, [line]);
  }
  const recipientsByQuotation = new Map<string, QuotationRecipientRow[]>();
  for (const { recipient } of recipients) {
    const bucket = recipientsByQuotation.get(recipient.quotationId);
    if (bucket) bucket.push(recipient);
    else recipientsByQuotation.set(recipient.quotationId, [recipient]);
  }
  return {
    items: items.map((i) =>
      toSummaryDTO(
        i.quotation,
        i.customerName,
        linesByQuotation.get(i.quotation.id) ?? [],
        recipientsByQuotation.get(i.quotation.id) ?? [],
      ),
    ),
    total,
  };
};

export const getQuotationById = loadDetail;

export const getQuotationTimeline = async (
  db: Db,
  id: string,
): Promise<QuotationEventDTO[]> => {
  const rows = await listQuotationEvents(db, id);
  return rows.map(({ event, actorName, contactName }) => ({
    id: event.id,
    type: event.type,
    actorId: opt(event.actorId),
    actorName: opt(actorName),
    contactId: opt(event.contactId),
    contactName: opt(contactName),
    refKind: opt(event.refKind),
    refId: opt(event.refId),
    changes: opt(event.changes),
    note: opt(event.note),
    createdAt: event.createdAt.toISOString(),
  }));
};

export const createQuotationDraft = async (
  db: Db,
  input: CreateQuotationInput,
  actorId: string,
): Promise<QuotationDetailDTO | null> => {
  const lines = await resolveLines(db, input.lines);
  const { quotation } = await createQuotation(
    db,
    {
      customerId: input.customerId,
      validUntil: input.validUntil,
      comments: input.comments ?? null,
      status: QuotationStatus.Draft,
      createdBy: actorId,
    },
    lines,
    actorId,
  );
  return loadDetail(db, quotation.id);
};

export const editQuotationDraft = async (
  db: Db,
  id: string,
  input: UpdateQuotationInput,
): Promise<QuotationDetailDTO | null> => {
  const found = await findQuotationWithCustomer(db, id);
  if (!found) return null;
  // Draft-only: once someone has been shown these numbers, editing them under
  // the same folio would make the trail lie about what was quoted.
  if (found.quotation.status !== QuotationStatus.Draft) {
    throw new QuotationNotDraftError(found.quotation.status);
  }
  const lines = input.lines ? await resolveLines(db, input.lines) : null;
  const row = await updateQuotationDraft(
    db,
    id,
    {
      ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
      ...(input.comments !== undefined ? { comments: input.comments || null } : {}),
    },
    lines,
  );
  if (!row) return null;
  return loadDetail(db, id);
};

export interface SendResult {
  quotation: QuotationDetailDTO;
  /** Per-recipient delivery outcome. The send itself is already committed when
   *  this is assembled — a bounced address does not undo the recipient row or
   *  its token, because the quote *was* sent and staff need to see which
   *  address failed rather than lose the whole operation. */
  delivery: { sent: number; failed: { email: string; error: string }[] };
}

export const sendQuotation = async (
  db: Db,
  env: Env,
  id: string,
  input: SendQuotationInput,
  actorId: string,
): Promise<SendResult | null> => {
  const found = await findQuotationWithCustomer(db, id);
  if (!found) return null;
  if (!isLiveStatus(found.quotation.status)) {
    throw new QuotationNotLiveError(found.quotation.status);
  }

  // Every contact must belong to THIS customer — the check that stops one
  // client's prices reaching another's inbox.
  const contacts = await findContactsForCustomer(
    db,
    found.quotation.customerId,
    input.recipients.map((r) => r.contactId),
  );
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const rows = input.recipients.map((r) => {
    const contact = contactById.get(r.contactId);
    // Unknown contact, or one with no address: both fail the whole send rather
    // than silently dropping a recipient the sender believes was included.
    if (!contact?.email) throw new InvalidRecipientError(r.contactId);
    return {
      quotationId: id,
      contactId: r.contactId,
      email: contact.email,
      isReviewer: r.isReviewer,
      // Only used on insert — the upsert keeps an existing row's token so a
      // link already in someone's inbox survives a re-send.
      token: generateAccessToken(),
    };
  });

  const saved = await upsertRecipients(db, rows);

  // Derive over the FULL reviewer set, not just this send's rows: a re-send
  // that adds a reviewer must move an `approved` quote back to
  // `partially_approved`, because it is no longer true that everyone approved.
  const all = await listRecipientsForQuotations(db, [id]);
  const reviewers = all.map((r) => r.recipient).filter((r) => r.isReviewer);
  const previousStatus = found.quotation.status;
  const nextStatus = deriveStatus(reviewers);
  const tally = tallyOf(reviewers);

  const events = [
    ...saved.map((recipient) => ({
      type: QuotationEventType.Sent,
      actorId,
      contactId: recipient.contactId,
      refKind: QuotationEventRefKind.Recipient,
      refId: recipient.id,
      changes: { email: recipient.email, isReviewer: recipient.isReviewer },
      note: input.message ?? null,
    })),
    ...(nextStatus !== previousStatus
      ? [
          {
            type: QuotationEventType.StatusDerived,
            actorId,
            changes: { from: previousStatus, to: nextStatus, tally },
          },
        ]
      : []),
  ];

  const updated = await setQuotationStatus(
    db,
    id,
    {
      status: nextStatus,
      // First send only — `sentAt` is when the quote left the building, and a
      // re-send does not restart that clock.
      ...(found.quotation.sentAt ? {} : { sentAt: new Date() }),
    },
    events,
  );
  if (!updated) return null;

  const [detail, brand] = await Promise.all([
    loadDetail(db, id),
    getBrand(db, env.LOGOS_CDN_BASE_URL),
  ]);
  if (!detail) return null;

  // One PDF per send, shared by every recipient's mail (20 §4 — the email
  // carries the document, not just the link). Generated fresh from the frozen
  // lines: nothing is stored, so it cannot drift from what the page shows.
  const pdf = toBase64(
    await renderQuotationPDF({
      brand,
      folio: detail.folio,
      customerName: detail.customerName,
      validUntil: detail.validUntil,
      comments: detail.comments,
      lines: detail.lines,
      totals: detail.totals,
    }),
  );

  // Mails go out concurrently, and `allSettled` because one bad address must
  // not cancel the rest of the send.
  const results = await Promise.allSettled(
    saved.map(async (recipient) => {
      const params = {
        brand: { name: brand.name, logoUrl: brand.logoUrl, colors: brand.colors },
        apiBaseUrl: env.API_BASE_URL,
        folio: detail.folio,
        customerName: detail.customerName,
        contactName: contactById.get(recipient.contactId)?.name,
        validUntil: detail.validUntil,
        total: detail.totals.total,
        lineCount: detail.lines.length,
        token: recipient.token,
        isReviewer: recipient.isReviewer,
        message: input.message,
      };
      await sendEmail({
        apiKey: env.RESEND_API_KEY,
        from: env.RESEND_FROM,
        to: recipient.email,
        subject: renderQuotationEmailSubject(params),
        html: renderQuotationEmailHTML(params),
        text: renderQuotationEmailText(params),
        attachments: [{ filename: `${detail.folio}.pdf`, content: pdf }],
      });
      return recipient.email;
    }),
  );

  const failed = results.flatMap((r, i) =>
    r.status === 'rejected'
      ? [{ email: saved[i]?.email ?? '', error: String((r.reason as Error)?.message ?? r.reason) }]
      : [],
  );

  return { quotation: detail, delivery: { sent: results.length - failed.length, failed } };
};

/** Revise (20 §2): a new linked draft that **re-reads the catalog**. That is
 *  the point — the documented reason to revise an expired quote is "revise for
 *  current prices", so copying the old snapshots would defeat it. A service
 *  soft-deleted since the original therefore fails the revision by id, which is
 *  honest: it can no longer be sold. */
export const reviseQuotation = async (
  db: Db,
  id: string,
  actorId: string,
): Promise<QuotationDetailDTO | null> => {
  const found = await findQuotationWithCustomer(db, id);
  if (!found) return null;
  if (!isLiveStatus(found.quotation.status)) {
    throw new QuotationNotLiveError(found.quotation.status);
  }
  const lines = await listLinesForQuotations(db, [id]);
  // Off-catalog lines have no catalog price to refresh — their snapshot carries
  // over verbatim. Catalog lines re-resolve, which is the point of revising.
  const resolved = await resolveLines(
    db,
    lines.map((l) =>
      l.serviceId
        ? {
            serviceId: l.serviceId,
            quantity: l.quantity,
            description: opt(l.description),
            discountAmount: l.discountAmount,
          }
        : {
            name: l.serviceName,
            unitPrice: l.unitPrice,
            uom: l.uom,
            taxRate: l.taxRate,
            quantity: l.quantity,
            description: opt(l.description),
            discountAmount: l.discountAmount,
          },
    ),
    { clampDiscount: true },
  );
  const { quotation } = await reviseQuotationRows(db, {
    previousId: id,
    header: {
      customerId: found.quotation.customerId,
      validUntil: found.quotation.validUntil,
      comments: found.quotation.comments,
      status: QuotationStatus.Draft,
      createdBy: actorId,
    },
    lines: resolved,
    actorId,
    note: `Reemplazada por una nueva versión de la cotización ${found.quotation.folio}.`,
  });
  return loadDetail(db, quotation.id);
};

export const cancelQuotation = async (
  db: Db,
  id: string,
  comment: string,
  actorId: string,
): Promise<QuotationDetailDTO | null> => {
  const found = await findQuotationWithCustomer(db, id);
  if (!found) return null;
  if (!isLiveStatus(found.quotation.status)) {
    throw new QuotationNotLiveError(found.quotation.status);
  }
  const updated = await setQuotationStatus(
    db,
    id,
    {
      status: QuotationStatus.Cancelled,
      cancelledAt: new Date(),
      resolutionReason: comment,
      resolvedByUserId: actorId,
    },
    [{ type: QuotationEventType.Cancelled, actorId, note: comment }],
  );
  if (!updated) return null;
  return loadDetail(db, id);
};

/** Audited soft delete. Unlike `/cancel` this is allowed from **any** state,
 *  terminal ones included: cancelling is a lifecycle decision about a live
 *  quote, deleting is housekeeping on the list — a duplicate, a test row, a
 *  quote raised against the wrong client. The row and its timeline stay
 *  forever; only visibility changes. */
export const removeQuotation = async (
  db: Db,
  id: string,
  deleteComment: string,
  actorId: string,
): Promise<{ id: string } | null> => softDeleteQuotation(db, id, deleteComment, actorId);

// ---------------------------------------------------------------------------
// Public token surface (20 §4)
// ---------------------------------------------------------------------------

const toPublicDTO = (
  quotation: QuotationRow,
  customerName: string,
  contactName: string | null,
  recipient: QuotationRecipientRow,
  lines: QuotationLineRow[],
): PublicQuotationDTO => {
  const overdue = isOverdue(quotation.validUntil);
  return {
    folio: quotation.folio,
    customerName,
    status: quotation.status,
    validUntil: quotation.validUntil,
    isOverdue: overdue,
    comments: opt(quotation.comments),
    lines: lines.map(toLineDTO),
    totals: quotationTotals(lines),
    viewer: {
      contactName: opt(contactName),
      isReviewer: recipient.isReviewer,
      response: opt(recipient.response),
      responseReason: opt(recipient.responseReason),
      respondedAt: opt(recipient.respondedAt?.toISOString()),
    },
    // Read stays open in every case — only the *action* closes. Someone who
    // opens an expired link should still see what they were quoted.
    canRespond: recipient.isReviewer && isTallyStatus(quotation.status) && !overdue,
  };
};

export const getQuotationByToken = async (
  db: Db,
  token: string,
): Promise<PublicQuotationDTO | null> => {
  const found = await findRecipientByToken(db, token);
  if (!found) return null;
  const lines = await listLinesForQuotations(db, [found.quotation.id]);

  // First open only; the append is skipped entirely on later reloads.
  if (await markRecipientViewed(db, found.recipient.id)) {
    await appendEvents(db, [
      {
        quotationId: found.quotation.id,
        type: QuotationEventType.Viewed,
        contactId: found.recipient.contactId,
        refKind: QuotationEventRefKind.Recipient,
        refId: found.recipient.id,
      },
    ]);
  }

  return toPublicDTO(
    found.quotation,
    found.customerName,
    found.contactName,
    found.recipient,
    lines,
  );
};

/** The same document the send attaches, fetched from the token page's
 *  "Descargar PDF" link. Reuses `getQuotationByToken`, so visibility rules and
 *  first-open viewed-marking live in one place. */
export const getQuotationPdfByToken = async (
  db: Db,
  env: Env,
  token: string,
): Promise<{ filename: string; bytes: Uint8Array } | null> => {
  const view = await getQuotationByToken(db, token);
  if (!view) return null;
  const brand = await getBrand(db, env.LOGOS_CDN_BASE_URL);
  return {
    filename: `${view.folio}.pdf`,
    bytes: await renderQuotationPDF({
      brand,
      folio: view.folio,
      customerName: view.customerName,
      validUntil: view.validUntil,
      comments: view.comments,
      lines: view.lines,
      totals: view.totals,
    }),
  };
};

export const respondToQuotation = async (
  db: Db,
  token: string,
  input: RespondQuotationInput,
): Promise<PublicQuotationDTO | null> => {
  const found = await findRecipientByToken(db, token);
  if (!found) return null;
  // An informational recipient holds a read-only copy.
  if (!found.recipient.isReviewer) throw new NotAReviewerError();
  // Resolved by staff → the answer no longer has anywhere to land.
  if (!isTallyStatus(found.quotation.status)) throw new QuotationClosedError('resolved');
  // Past `validUntil` → the prices are no longer ones the tenant can honour.
  if (isOverdue(found.quotation.validUntil)) throw new QuotationClosedError('expired');

  const all = await listRecipientsForQuotations(db, [found.quotation.id]);
  // The tally as it will be *after* this response — this reviewer's new answer
  // substituted in, everyone else's left alone.
  const reviewers = all
    .map((r) => r.recipient)
    .filter((r) => r.isReviewer)
    .map((r) =>
      r.id === found.recipient.id ? { response: input.response } : { response: r.response },
    );
  const nextStatus = deriveStatus(reviewers);

  const updated = await recordResponseAndDeriveStatus(db, {
    recipient: found.recipient,
    response: input.response,
    reason: input.reason ?? null,
    nextStatus,
    previousStatus: found.quotation.status,
    tally: tallyOf(reviewers),
  });
  if (!updated) return null;

  const lines = await listLinesForQuotations(db, [found.quotation.id]);
  return toPublicDTO(updated, found.customerName, found.contactName, {
    ...found.recipient,
    response: input.response as QuotationResponse,
    responseReason: input.reason ?? null,
    respondedAt: new Date(),
  }, lines);
};
