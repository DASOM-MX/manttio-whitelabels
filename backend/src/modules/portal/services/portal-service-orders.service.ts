import type { Db } from '../../database/client';
import { listOrderLines } from '../../service-orders/repository/service-orders.repository';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import type {
  PortalServiceOrderDetail,
  PortalServiceOrderListItem,
} from '../dtos/portal-service-order.dto';
import {
  toPortalServiceOrderDetail,
  toPortalServiceOrderLine,
  toPortalServiceOrderListItem,
} from '../helpers/portal-service-order.helpers';
import {
  findPortalServiceOrder,
  listPortalServiceOrders,
  releasedReportCountsForOrders,
  releasedReportsForOrder,
  visitDatesForOrder,
} from '../repository/portal-service-orders.repository';
import type { PortalServiceOrdersQuery } from '../validators/portal-reads.validator';

export const listServiceOrdersForPortal = async (
  db: Db,
  customerId: string,
  q: PortalServiceOrdersQuery,
): Promise<GenericQueryResponse<PortalServiceOrderListItem>> => {
  const page = await listPortalServiceOrders(db, customerId, q);
  const counts = await releasedReportCountsForOrders(
    db,
    page.items.map((i) => i.row.id),
  );
  return {
    ...page,
    items: page.items.map((i) =>
      toPortalServiceOrderListItem(i.row, {
        quotationFolio: i.quotationFolio,
        reportCount: counts.get(i.row.id) ?? 0,
      }),
    ),
  };
};

export const getServiceOrderForPortal = async (
  db: Db,
  customerId: string,
  id: string,
): Promise<PortalServiceOrderDetail | null> => {
  const found = await findPortalServiceOrder(db, customerId, id);
  if (!found) return null;

  const [lines, linkedReports, visitDates] = await Promise.all([
    listOrderLines(db, found.row.id),
    releasedReportsForOrder(db, found.row.id),
    visitDatesForOrder(db, found.row.id),
  ]);

  return toPortalServiceOrderDetail(found.row, {
    quotationFolio: found.quotationFolio,
    // The list column and the detail's linked list count the same released
    // reports, so a count never promises a document that 404s.
    reportCount: linkedReports.length,
    quotationId: found.quotationId,
    lines: lines.map(toPortalServiceOrderLine),
    linkedReports,
    visitDates,
  });
};
