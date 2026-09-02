import type {
  QuotationResponse,
  QuotationStatus,
} from '../../quotations/enums/quotations.enum';
import type { ServiceTaxRate, ServiceUom } from '../../services/enums/services.enum';

/** A quotation line, frozen at send time. Tax and discount are kept: the
 *  customer is approving a priced document, and hiding either makes the total
 *  unverifiable. Cost and margin are not on this table at all. */
export interface PortalQuotationLine {
  id: string;
  serviceName: string;
  description: string | null;
  uom: ServiceUom;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxRate: ServiceTaxRate;
}

/** One reviewer and their answer (A14). Informational recipients are filtered
 *  out upstream, not blanked — they hold no decision. */
export interface PortalQuotationReviewer {
  contactName: string | null;
  response: QuotationResponse | null;
  respondedAt: Date | null;
}

/** A quotation as the customer sees it (04 §5). Staff attribution,
 *  `resolutionReason` and the supersede chain are dropped. */
export interface PortalQuotationListItem {
  id: string;
  folio: string;
  status: QuotationStatus;
  sentAt: Date | null;
  validUntil: string;
  /** Computed on read, never stored. */
  isOverdue: boolean;
  total: string;
  createdAt: Date;
}

export interface PortalQuotationDetail extends PortalQuotationListItem {
  comments: string | null;
  lines: PortalQuotationLine[];
  reviewers: PortalQuotationReviewer[];
}
