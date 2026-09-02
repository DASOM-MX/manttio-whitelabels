import type {
  QuotationResponse,
  QuotationStatus,
} from '../../quotations/enums/quotations.enum';
import type { ServiceTaxRate, ServiceUom } from '../../services/enums/services.enum';
import type {
  QuotationLineRow,
  QuotationRecipientRow,
  QuotationRow,
} from '../../quotations/types/quotations.types';

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

/** Joins a quotation list row needs. `total` is summed from the lines. */
export interface PortalQuotationListExtras {
  total: string;
}

export interface PortalQuotationDetailExtras extends PortalQuotationListExtras {
  lines: PortalQuotationLine[];
  reviewers: PortalQuotationReviewer[];
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

export const toPortalQuotationLine = (row: QuotationLineRow): PortalQuotationLine => ({
  id: row.id,
  serviceName: row.serviceName,
  description: row.description,
  uom: row.uom,
  quantity: row.quantity,
  unitPrice: row.unitPrice,
  discountAmount: row.discountAmount,
  taxRate: row.taxRate,
});

/** Takes the reviewer's contact name separately — `quotation_recipients.email`
 *  is another contact's personal data and never leaves the staff surface. */
export const toPortalQuotationReviewer = (
  row: QuotationRecipientRow,
  contactName: string | null,
): PortalQuotationReviewer => ({
  contactName,
  response: row.response,
  respondedAt: row.respondedAt,
});

export const toPortalQuotationListItem = (
  row: QuotationRow,
  extras: PortalQuotationListExtras,
  today: string,
): PortalQuotationListItem => ({
  id: row.id,
  folio: row.folio,
  status: row.status,
  sentAt: row.sentAt,
  validUntil: row.validUntil,
  isOverdue: row.validUntil < today,
  total: extras.total,
  createdAt: row.createdAt,
});

export const toPortalQuotationDetail = (
  row: QuotationRow,
  extras: PortalQuotationDetailExtras,
  today: string,
): PortalQuotationDetail => ({
  ...toPortalQuotationListItem(row, extras, today),
  comments: row.comments,
  lines: extras.lines,
  reviewers: extras.reviewers,
});
