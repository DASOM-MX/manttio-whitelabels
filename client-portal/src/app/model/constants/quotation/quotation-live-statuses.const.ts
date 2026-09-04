import { QuotationStatus } from '../../enums/quotation/quotation-status.enum';

/** Statuses whose `isOverdue` flag still means something — a resolved quote
 *  (converted or cancelled) has nothing left to revise, so "Vencida" would be
 *  trivia on that row. Mirrors the backend's `LIVE_STATUSES`. */
export const QUOTATION_LIVE_STATUSES: QuotationStatus[] = [
  QuotationStatus.Draft,
  QuotationStatus.WaitingApproval,
  QuotationStatus.PartiallyApproved,
  QuotationStatus.Approved,
  QuotationStatus.Declined,
];
