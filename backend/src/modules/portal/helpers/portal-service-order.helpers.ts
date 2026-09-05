import type {
  ServiceOrderLineRow,
  ServiceOrderRow,
} from '../../service-orders/types/service-orders.types';
import type {
  PortalServiceOrderDetail,
  PortalServiceOrderLine,
  PortalServiceOrderListItem,
} from '../dtos/portal-service-order.dto';
import type {
  PortalServiceOrderDetailExtras,
  PortalServiceOrderListExtras,
} from '../types/portal.types';

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
  createdAt: row.createdAt.toISOString(),
});

export const toPortalServiceOrderDetail = (
  row: ServiceOrderRow,
  extras: PortalServiceOrderDetailExtras,
): PortalServiceOrderDetail => ({
  ...toPortalServiceOrderListItem(row, extras),
  quotationId: extras.quotationId,
  lines: extras.lines,
  linkedReports: extras.linkedReports,
  visits: extras.visits.map((v) => ({
    scheduledStart: v.scheduledStart.toISOString(),
    scheduledEnd: v.scheduledEnd?.toISOString() ?? null,
    status: v.status,
  })),
});
