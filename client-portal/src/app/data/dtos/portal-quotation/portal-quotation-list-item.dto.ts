import type { QuotationStatus } from '../../../model/enums/quotation/quotation-status.enum';

/** A quotation row as the customer sees it (backend `PortalQuotationListItem`,
 *  04 §5). Staff attribution, cost/margin and `resolutionReason` are never
 *  sent. No priority field exists on this wire shape (A15). */
export interface PortalQuotationListItem {
  id: string;
  folio: string;
  status: QuotationStatus;
  sentAt: string | null;
  validUntil: string;
  /** Computed on read, never stored. */
  isOverdue: boolean;
  total: string;
  createdAt: string;
}
