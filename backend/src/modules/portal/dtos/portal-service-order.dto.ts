import type { ServiceOrderStatus } from '../../service-orders/enums/service-orders.enum';
import type { PortalLinkedReport } from './portal-report.dto';
import type { PortalPricedLine } from './portal-priced-line.dto';

/** One scope line, frozen at order creation — the priced line without the
 *  quotation's `description`, which `service_order_services` does not carry.
 *  Named for the domain so it can diverge later without touching callers. */
export type PortalServiceOrderLine = PortalPricedLine;

/** A service order as the customer sees it (04 §6). `priority` is an internal
 *  dispatch signal and is never sent (A15). */
export interface PortalServiceOrderListItem {
  id: string;
  folio: string;
  status: ServiceOrderStatus;
  /** The customer's own site — not a staff field. */
  location: string | null;
  promisedDate: string | null;
  quotationFolio: string | null;
  reportCount: number;
  createdAt: Date;
}

/** `comments` is absent by design: the order's staff-side dispatch notes are
 *  exactly the "internal notes" 04 §6 strips. */
export interface PortalServiceOrderDetail extends PortalServiceOrderListItem {
  quotationId: string | null;
  lines: PortalServiceOrderLine[];
  linkedReports: PortalLinkedReport[];
  /** Dates only (04 §6) — never the technician assignment churn behind them. */
  visitDates: Date[];
}
