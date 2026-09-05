import type { ServiceOrderStatus } from '../../service-orders/enums/service-orders.enum';
import type { VisitStatus } from '../../visits/enums/visits.enum';
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
  createdAt: string;
}

/** One visit on the order (04 §6, amended 2026-09-05): when it is booked, and
 *  how it went. Still no technician — the assignment churn behind a visit stays
 *  staff-side. `closed` visits never reach here; their successor row does. */
export interface PortalServiceOrderVisit {
  scheduledStart: string;
  scheduledEnd: string | null;
  status: VisitStatus;
}

/** `comments` is absent by design: the order's staff-side dispatch notes are
 *  exactly the "internal notes" 04 §6 strips. */
export interface PortalServiceOrderDetail extends PortalServiceOrderListItem {
  quotationId: string | null;
  lines: PortalServiceOrderLine[];
  linkedReports: PortalLinkedReport[];
  /** Date, window and status (04 §6, amended 2026-09-05) — never the
   *  technician assignment churn behind them. */
  visits: PortalServiceOrderVisit[];
}
