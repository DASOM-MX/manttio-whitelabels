import type { ReportStatus } from '../../reports/enums/reports.enum';
import type { ServiceOrderStatus } from '../../service-orders/enums/service-orders.enum';
import type { ServiceTaxRate, ServiceUom } from '../../services/enums/services.enum';

/** One scope line, frozen at order creation. Same tax/discount reasoning as the
 *  quotation line. */
export interface PortalServiceOrderLine {
  id: string;
  serviceName: string;
  uom: ServiceUom;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxRate: ServiceTaxRate;
}

/** A linked report, enough to render the row and deep-link into 04 §3. */
export interface PortalServiceOrderLinkedReport {
  id: string;
  reportType: string;
  status: ReportStatus;
  createdAt: Date;
}

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
  linkedReports: PortalServiceOrderLinkedReport[];
  /** Dates only (04 §6) — never the technician assignment churn behind them. */
  visitDates: Date[];
}
