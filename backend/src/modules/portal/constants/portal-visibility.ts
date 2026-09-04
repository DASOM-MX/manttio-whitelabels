import { QuotationStatus } from '../../quotations/enums/quotations.enum';
import { ReportStatus } from '../../reports/enums/reports.enum';
import { ServiceOrderStatus } from '../../service-orders/enums/service-orders.enum';

// Only records staff deliberately released reach the portal (04 §2, A7). These
// are the `WHERE` half of that rule — a hidden record is absent from every list
// AND 404s on direct access, never filtered in the UI.

/** Delivered work only. `pending`/`created`/`in-progress` are unfinished and
 *  `cancelled` was voided with its order. */
export const PORTAL_REPORT_STATUSES: ReportStatus[] = [
  ReportStatus.Finished,
  ReportStatus.Mailed,
];

/** Everything the customer was actually mailed. `draft` was never sent and
 *  `cancelled` is a document the tenant retracted. */
export const PORTAL_QUOTATION_STATUSES: QuotationStatus[] = [
  QuotationStatus.WaitingApproval,
  QuotationStatus.PartiallyApproved,
  QuotationStatus.Approved,
  QuotationStatus.Declined,
  QuotationStatus.OrderCreated,
];

/** Live and finished jobs. A cancelled order is not the customer's business. */
export const PORTAL_SERVICE_ORDER_STATUSES: ServiceOrderStatus[] = [
  ServiceOrderStatus.Open,
  ServiceOrderStatus.Completed,
];

// Contracts and equipment carry no released/unreleased status: the only filter
// is the soft delete (which is also how a contract is terminated early), so
// both live in their repositories as `isNull(deletedAt)` rather than here.
