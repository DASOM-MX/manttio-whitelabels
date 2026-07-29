import { QuotationStatus } from '../../enums/quotation/quotation-status.enum';

/** p-tag severities per status — pills always pair color with a label.
 *  `Cancelled` takes `contrast` rather than a second `secondary` so it never
 *  reads as a draft: one has not left the building, the other is over. */
export const QUOTATION_STATUS_SEVERITIES: Record<
  QuotationStatus,
  'secondary' | 'info' | 'success' | 'warn' | 'danger' | 'contrast'
> = {
  [QuotationStatus.Draft]: 'secondary',
  [QuotationStatus.WaitingApproval]: 'info',
  [QuotationStatus.PartiallyApproved]: 'warn',
  [QuotationStatus.Approved]: 'success',
  [QuotationStatus.Declined]: 'danger',
  [QuotationStatus.Cancelled]: 'contrast',
  [QuotationStatus.OrderCreated]: 'success',
};
