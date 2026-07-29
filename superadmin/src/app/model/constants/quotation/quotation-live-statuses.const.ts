import { QuotationStatus } from '../../enums/quotation/quotation-status.enum';

/** Live = not closed by a staff terminal action, so send / revise / cancel are
 *  still offered. `Declined` is a member on purpose: a client saying no does not
 *  end the quote (20 §2). Mirrors the backend's `LIVE_STATUSES` — the API
 *  enforces it, this list only decides which buttons render. */
export const QUOTATION_LIVE_STATUSES: readonly QuotationStatus[] = [
  QuotationStatus.Draft,
  QuotationStatus.WaitingApproval,
  QuotationStatus.PartiallyApproved,
  QuotationStatus.Approved,
  QuotationStatus.Declined,
];
