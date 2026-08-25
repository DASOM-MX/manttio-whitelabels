import type { quotations, quotationCounters } from '../models/quotations.model';
import type { quotationLines } from '../models/quotation-lines.model';
import type { quotationRecipients } from '../models/quotation-recipients.model';
import type { quotationEvents } from '../models/quotation-events.model';
import type {
  QuotationEventRefKind,
  QuotationEventType,
  QuotationResponse,
  QuotationStatus,
} from '../enums/quotations.enum';
import type { ServiceTaxRate, ServiceUom } from '../../services/enums/services.enum';
import type { QuotationTally } from '../utils/quotation-status';
import type { QuotationTotals } from '../utils/quotation-totals';

export type QuotationRow = typeof quotations.$inferSelect;
export type NewQuotation = typeof quotations.$inferInsert;
export type QuotationCounterRow = typeof quotationCounters.$inferSelect;
export type QuotationLineRow = typeof quotationLines.$inferSelect;
export type NewQuotationLine = typeof quotationLines.$inferInsert;
export type QuotationRecipientRow = typeof quotationRecipients.$inferSelect;
export type NewQuotationRecipient = typeof quotationRecipients.$inferInsert;
export type QuotationEventRow = typeof quotationEvents.$inferSelect;
export type NewQuotationEvent = typeof quotationEvents.$inferInsert;

/** A quotation joined to its customer's display name — the row shape every
 *  quotation read that renders a client label returns. The name lives on
 *  `customers`, so the join is unavoidable; naming the pair keeps it out of
 *  inline positions inside `GenericQueryResponse<T>`. */
export interface QuotationWithCustomer {
  quotation: QuotationRow;
  customerName: string;
}

/** Draft-only mutations (20 §9 — `PATCH` 409s once sent). Lines are replaced
 *  wholesale rather than patched field-by-field: a quote's line set is one
 *  editorial unit, and diffing it would invite partial states no reviewer ever
 *  saw. */
export type UpdateQuotationFields = Partial<Pick<QuotationRow, 'validUntil' | 'comments'>>;

/** A line as the API renders it. `lineSubtotal` is computed on read — the
 *  column deliberately does not exist (see `quotation-totals.ts`). No
 *  `serviceId` = an off-catalog line (decided 2026-07-29); `quantity` is a
 *  decimal string (numeric(12,3)) and `discountAmount` a frozen amount, same
 *  date. */
export interface QuotationLineDTO {
  id: string;
  serviceId?: string;
  serviceName: string;
  description?: string;
  unitPrice: string;
  uom: ServiceUom;
  taxRate: ServiceTaxRate;
  quantity: string;
  discountAmount: string;
  /** The line's Importe (`unitPrice × quantity`, pre-discount — CFDI's meaning). */
  lineSubtotal: string;
}

/** A recipient as staff see it — including who approved, who didn't, and why
 *  (20 §2). `token` is never present: it is the bearer secret for that one
 *  contact, and the staff UI has no use for it. */
export interface QuotationRecipientDTO {
  id: string;
  contactId: string;
  contactName?: string;
  email: string;
  isReviewer: boolean;
  sentAt: string;
  viewedAt?: string;
  respondedAt?: string;
  response?: QuotationResponse;
  responseReason?: string;
}

/** List row (20 §8). Carries the total so the list can show money without
 *  fetching every quote's lines. */
export interface QuotationSummaryDTO {
  id: string;
  folio: string;
  customerId: string;
  customerName: string;
  status: QuotationStatus;
  validUntil: string;
  /** `validUntil` is past — computed on read (owner 2026-07-26), never stored,
   *  so it can't be stale between cron runs. A guard, not a status: the quote
   *  keeps whatever tally state it had. */
  isOverdue: boolean;
  total: string;
  tally: QuotationTally;
  createdAt: string;
  updatedAt: string;
}

export interface QuotationDetailDTO extends QuotationSummaryDTO {
  comments?: string;
  supersedesQuotationId?: string;
  sentAt?: string;
  resolutionReason?: string;
  cancelledAt?: string;
  orderCreatedAt?: string;
  resolvedByUserId?: string;
  serviceOrderId?: string;
  createdBy: string;
  lines: QuotationLineDTO[];
  recipients: QuotationRecipientDTO[];
  totals: QuotationTotals;
}

/** A resolved timeline entry (20 §5). Names are resolved server-side so the UI
 *  renders a sentence without a second round-trip per row. */
export interface QuotationEventDTO {
  id: string;
  type: QuotationEventType;
  actorId?: string;
  actorName?: string;
  contactId?: string;
  contactName?: string;
  refKind?: QuotationEventRefKind;
  refId?: string;
  changes?: Record<string, unknown>;
  note?: string;
  createdAt: string;
}

/** What the unauthenticated token page may see (20 §4). A hand-picked subset —
 *  no internal ids, no `cost`, no other recipients' answers, no staff notes.
 *  The viewer is a client contact, and everything here is something they were
 *  already mailed. */
export interface PublicQuotationDTO {
  folio: string;
  customerName: string;
  status: QuotationStatus;
  validUntil: string;
  isOverdue: boolean;
  comments?: string;
  lines: QuotationLineDTO[];
  totals: QuotationTotals;
  /** This viewer's own standing, so the page can render their current answer
   *  and let a reviewer change it. */
  viewer: {
    contactName?: string;
    isReviewer: boolean;
    response?: QuotationResponse;
    responseReason?: string;
    respondedAt?: string;
  };
  /** Whether the page should render Aprobar/Rechazar at all: a reviewer token,
   *  on a live quote, before `validUntil`. */
  canRespond: boolean;
}
