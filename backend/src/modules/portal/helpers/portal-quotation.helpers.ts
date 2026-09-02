import type {
  QuotationLineRow,
  QuotationRecipientRow,
  QuotationRow,
} from '../../quotations/types/quotations.types';
import type {
  PortalQuotationDetail,
  PortalQuotationLine,
  PortalQuotationListItem,
  PortalQuotationReviewer,
} from '../dtos/portal-quotation.dto';
import type {
  PortalQuotationDetailExtras,
  PortalQuotationListExtras,
} from '../types/portal.types';

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

// `today` comes from the caller so no mapper reads a clock.
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
