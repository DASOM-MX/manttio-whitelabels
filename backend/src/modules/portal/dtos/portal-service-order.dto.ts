import type { ReportStatus } from '../../reports/enums/reports.enum';
import type { ServiceTaxRate, ServiceUom } from '../../services/enums/services.enum';
import type { ServiceOrderStatus } from '../../service-orders/enums/service-orders.enum';
import type {
  ServiceOrderLineRow,
  ServiceOrderRow,
} from '../../service-orders/types/service-orders.types';

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

export interface PortalServiceOrderListExtras {
  /** Folio of the quotation this order came from, if any. */
  quotationFolio: string | null;
  reportCount: number;
}

export interface PortalServiceOrderDetailExtras extends PortalServiceOrderListExtras {
  quotationId: string | null;
  lines: PortalServiceOrderLine[];
  linkedReports: PortalServiceOrderLinkedReport[];
  /** Dates only (04 §6) — never the technician assignment churn behind them. */
  visitDates: Date[];
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
  visitDates: Date[];
}

export const toPortalServiceOrderLine = (
  row: ServiceOrderLineRow,
): PortalServiceOrderLine => ({
  id: row.id,
  serviceName: row.serviceName,
  uom: row.uom,
  quantity: row.quantity,
  unitPrice: row.unitPrice,
  discountAmount: row.discountAmount,
  taxRate: row.taxRate,
});

export const toPortalServiceOrderListItem = (
  row: ServiceOrderRow,
  extras: PortalServiceOrderListExtras,
): PortalServiceOrderListItem => ({
  id: row.id,
  folio: row.folio,
  status: row.status,
  location: row.location,
  promisedDate: row.promisedDate,
  quotationFolio: extras.quotationFolio,
  reportCount: extras.reportCount,
  createdAt: row.createdAt,
});

export const toPortalServiceOrderDetail = (
  row: ServiceOrderRow,
  extras: PortalServiceOrderDetailExtras,
): PortalServiceOrderDetail => ({
  ...toPortalServiceOrderListItem(row, extras),
  quotationId: extras.quotationId,
  lines: extras.lines,
  linkedReports: extras.linkedReports,
  visitDates: extras.visitDates,
});
