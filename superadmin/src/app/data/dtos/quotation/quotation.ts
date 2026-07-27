import type { QuotationStatus } from '../../../model/enums/quotation/quotation-status.enum';
import type { QuotationLine } from './quotation-line';
import type { QuotationRecipient } from './quotation-recipient';
import type { QuotationTally } from './quotation-tally';
import type { QuotationTotals } from './quotation-totals';

/** List row (20 §8) — carries the total so the table shows money without
 *  fetching every quote's lines. */
export interface QuotationSummary {
  id: string;
  folio: string;
  customerId: string;
  customerName: string;
  status: QuotationStatus;
  /** `YYYY-MM-DD` — a calendar date, never an instant. */
  validUntil: string;
  /** Computed on read, never stored. A guard, not a status: the quote keeps
   *  whatever tally state it had. */
  isOverdue: boolean;
  total: string;
  tally: QuotationTally;
  createdAt: string;
  updatedAt: string;
}

export interface QuotationDetail extends QuotationSummary {
  comments?: string;
  /** This quote replaces a prior one, which was cancelled on revise. */
  supersedesQuotationId?: string;
  sentAt?: string;
  /** The mandatory "why" behind cancel or convert. */
  resolutionReason?: string;
  cancelledAt?: string;
  orderCreatedAt?: string;
  resolvedByUserId?: string;
  serviceOrderId?: string;
  createdBy: string;
  lines: QuotationLine[];
  recipients: QuotationRecipient[];
  totals: QuotationTotals;
}
