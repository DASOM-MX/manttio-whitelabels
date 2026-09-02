import type {
  QuotationResponse,
  QuotationStatus,
} from '../../quotations/enums/quotations.enum';
import type { PortalPricedLine } from './portal-priced-line.dto';

/** Tax and discount are kept: the customer is approving a priced document, and
 *  hiding either makes the total unverifiable. Cost and margin are not on this
 *  table at all. `description` is the one field an order line does not carry. */
export interface PortalQuotationLine extends PortalPricedLine {
  description: string | null;
}

/** One reviewer and their answer (A14). Informational recipients are filtered
 *  out upstream, not blanked — they hold no decision. */
export interface PortalQuotationReviewer {
  contactName: string | null;
  response: QuotationResponse | null;
  respondedAt: string | null;
}

/** A quotation as the customer sees it (04 §5). Staff attribution,
 *  `resolutionReason` and the supersede chain are dropped. */
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

export interface PortalQuotationDetail extends PortalQuotationListItem {
  comments: string | null;
  lines: PortalQuotationLine[];
  reviewers: PortalQuotationReviewer[];
}
