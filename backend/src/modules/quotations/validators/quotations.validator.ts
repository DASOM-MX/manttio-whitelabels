import { z } from 'zod';
import { QuotationResponse, QuotationStatus } from '../enums/quotations.enum';

// A calendar date (YYYY-MM-DD) for the `date` column. Kept as a string rather
// than coerced through `Date`: parsing "2026-08-01" as a Date lands on UTC
// midnight, which in a negative-offset timezone is the day before — and an
// expiry that silently shifts a day is exactly the bug a quote can't have.
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Fecha inexistente');

// A line asks for a service and a quantity; every priced field is a snapshot
// the server resolves from the catalog (20 §9). The client cannot send
// `unitPrice`/`taxRate`/`uom` — accepting them would let a caller quote a price
// the catalog never held, which defeats the entire freeze.
const quotationLineInput = z.object({
  serviceId: z.string().uuid(),
  quantity: z.number().int().min(1),
  // The only line field the builder may override: a per-line note replacing
  // the catalog description.
  description: z.string().trim().optional(),
});

export const createQuotationSchema = z.object({
  customerId: z.string().uuid(),
  validUntil: calendarDate,
  comments: z.string().optional(),
  lines: z.array(quotationLineInput).min(1, 'La cotización necesita al menos una partida'),
});

// Draft-only (409 once sent). Lines are replaced wholesale when present — see
// `UpdateQuotationFields`.
export const updateQuotationSchema = z.object({
  validUntil: calendarDate.optional(),
  comments: z.string().optional(),
  lines: z.array(quotationLineInput).min(1).optional(),
});

// Recipients are chosen from the customer's contacts (07); each carries the
// reviewer toggle. Zero reviewers is allowed (owner 2026-07-26) — an
// informational send — so there is deliberately no `.refine` demanding one.
export const sendQuotationSchema = z
  .object({
    recipients: z
      .array(z.object({ contactId: z.string().uuid(), isReviewer: z.boolean().default(false) }))
      .min(1, 'Elige al menos un destinatario'),
    message: z.string().trim().optional(),
  })
  // One entry per contact. The recipient upsert writes the whole list in a
  // single statement, and Postgres rejects an ON CONFLICT that would touch the
  // same row twice — so a repeated contact used to surface as a 500 carrying
  // the raw driver message. Rejecting here is also the more honest answer than
  // silently de-duplicating: two entries for one contact disagree about
  // `isReviewer`, and picking a winner would quietly decide who may approve.
  .refine((v) => new Set(v.recipients.map((r) => r.contactId)).size === v.recipients.length, {
    path: ['recipients'],
    message: 'Hay un destinatario repetido; elige cada contacto una sola vez.',
  });

// Both terminal staff actions carry a mandatory comment — the audit "why"
// (20 §2). `min(1)` after trim so whitespace can't satisfy it.
const resolutionComment = z.object({ comment: z.string().trim().min(1, 'El comentario es obligatorio') });

export const cancelQuotationSchema = resolutionComment;
export const createOrderFromQuotationSchema = resolutionComment;

// Audited soft delete, same contract as users/services/equipment. Distinct from
// `/cancel`: cancelling retires a quote the client may still be shown, deleting
// takes it out of the tenant's own lists (and kills every recipient link).
export const deleteQuotationSchema = z.object({
  deleteComment: z.string().trim().min(1, 'El comentario es obligatorio'),
});

/** `GET /customers/:id/quotations` — the client is the path, so the only query
 *  left is paging. Deliberately not `listQuotationsQuerySchema.pick(...)`: a
 *  `customerId` in the query string of a customer-scoped route could disagree
 *  with the path, and there is no sensible way to resolve that. */
export const customerQuotationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listQuotationsQuerySchema = z.object({
  q: z.string().optional(),
  customerId: z.string().uuid().optional(),
  status: z.nativeEnum(QuotationStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// The public token page's only write. A decline must say why; an approval
// need not — refusing costs the client something and the reason is what staff
// act on, while "yes" is self-explanatory.
export const respondQuotationSchema = z
  .object({
    response: z.nativeEnum(QuotationResponse),
    reason: z.string().trim().optional(),
  })
  .refine(
    (v) => v.response !== QuotationResponse.Declined || !!v.reason,
    { path: ['reason'], message: 'Indica el motivo del rechazo' },
  );

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type SendQuotationInput = z.infer<typeof sendQuotationSchema>;
export type CancelQuotationInput = z.infer<typeof cancelQuotationSchema>;
export type DeleteQuotationInput = z.infer<typeof deleteQuotationSchema>;
export type ListQuotationsQuery = z.infer<typeof listQuotationsQuerySchema>;
export type RespondQuotationInput = z.infer<typeof respondQuotationSchema>;
export type QuotationLineInput = z.infer<typeof quotationLineInput>;
