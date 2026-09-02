import { and, asc, desc, eq, ilike, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { QuotationStatus } from '../../quotations/enums/quotations.enum';
import { quotations } from '../../quotations/models/quotations.model';
import { reports } from '../../reports/models/reports.model';
import { serviceOrders } from '../../service-orders/models/service-orders.model';
import type { ServiceOrderRow } from '../../service-orders/types/service-orders.types';
import { scheduledVisits } from '../../visits/models/visits.model';
import { VisitStatus } from '../../visits/enums/visits.enum';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import type { PortalLinkedReport } from '../dtos/portal-report.dto';
import {
  PORTAL_REPORT_STATUSES,
  PORTAL_SERVICE_ORDER_STATUSES,
} from '../constants/portal-visibility';
import type { PortalServiceOrdersQuery } from '../validators/portal-reads.validator';

/** An order row plus the quote it was born from (04 §6's folio column). */
export interface PortalServiceOrderRow {
  row: ServiceOrderRow;
  quotationId: string | null;
  quotationFolio: string | null;
}

// Scope + release: the token's customer, live rows, `open` or `completed`.
// A cancelled order is not the customer's business (04 §2).
const visible = (customerId: string): SQL =>
  and(
    eq(serviceOrders.customerId, customerId),
    isNull(serviceOrders.deletedAt),
    inArray(serviceOrders.status, PORTAL_SERVICE_ORDER_STATUSES),
  )!;

// The quote this order was born from, read from its only home
// (`quotations.service_order_id`). Correlated rather than joined: an order
// collects several quotations over its life and a join would return the order
// once per quote.
const bornFromQuotationId = sql<string | null>`(
  select ${quotations.id} from ${quotations}
  where ${quotations.serviceOrderId} = ${serviceOrders.id}
    and ${quotations.status} = ${QuotationStatus.OrderCreated}
    and ${quotations.deletedAt} is null
  limit 1
)`;

const bornFromQuotationFolio = sql<string | null>`(
  select ${quotations.folio} from ${quotations}
  where ${quotations.serviceOrderId} = ${serviceOrders.id}
    and ${quotations.status} = ${QuotationStatus.OrderCreated}
    and ${quotations.deletedAt} is null
  limit 1
)`;

const orderColumns = {
  row: serviceOrders,
  quotationId: bornFromQuotationId,
  quotationFolio: bornFromQuotationFolio,
};

const filters = (customerId: string, q: PortalServiceOrdersQuery): SQL => {
  const conds: SQL[] = [visible(customerId)];
  if (q.status) conds.push(eq(serviceOrders.status, q.status));
  if (q.search) conds.push(ilike(serviceOrders.folio, `%${q.search}%`));
  return and(...conds)!;
};

export const listPortalServiceOrders = async (
  db: Db,
  customerId: string,
  q: PortalServiceOrdersQuery,
): Promise<GenericQueryResponse<PortalServiceOrderRow>> => {
  const where = filters(customerId, q);

  const rows = await db
    .select(orderColumns)
    .from(serviceOrders)
    .where(where)
    .orderBy(desc(serviceOrders.createdAt))
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);

  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(serviceOrders)
    .where(where);

  return {
    items: rows.map((r) => ({
      row: r.row,
      quotationId: r.quotationId ?? null,
      quotationFolio: r.quotationFolio ?? null,
    })),
    total: count?.total ?? 0,
    page: q.page,
    limit: q.limit,
  };
};

export const findPortalServiceOrder = async (
  db: Db,
  customerId: string,
  id: string,
): Promise<PortalServiceOrderRow | null> => {
  const [row] = await db
    .select(orderColumns)
    .from(serviceOrders)
    .where(and(eq(serviceOrders.id, id), visible(customerId)))
    .limit(1);
  return row
    ? {
        row: row.row,
        quotationId: row.quotationId ?? null,
        quotationFolio: row.quotationFolio ?? null,
      }
    : null;
};

/** Released reports per order, in one grouped round trip. Counts exactly what
 *  the customer can open — the list column and the detail's `linkedReports`
 *  must agree, or the count promises documents that 404. */
export const releasedReportCountsForOrders = async (
  db: Db,
  orderIds: string[],
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  if (!orderIds.length) return counts;
  const rows = await db
    .select({ serviceOrderId: reports.serviceOrderId, total: sql<number>`count(*)::int` })
    .from(reports)
    .where(
      and(
        inArray(reports.serviceOrderId, orderIds),
        isNull(reports.deletedAt),
        inArray(reports.status, PORTAL_REPORT_STATUSES),
      ),
    )
    .groupBy(reports.serviceOrderId);
  for (const row of rows) {
    if (row.serviceOrderId) counts.set(row.serviceOrderId, row.total);
  }
  return counts;
};

/** The order's released reports, for the detail's deep-links into 04 §3. */
export const releasedReportsForOrder = async (
  db: Db,
  serviceOrderId: string,
): Promise<PortalLinkedReport[]> => {
  const rows = await db
    .select({
      id: reports.id,
      reportType: reports.reportType,
      status: reports.status,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .where(
      and(
        eq(reports.serviceOrderId, serviceOrderId),
        isNull(reports.deletedAt),
        inArray(reports.status, PORTAL_REPORT_STATUSES),
      ),
    )
    .orderBy(desc(reports.createdAt));
  return rows.map((r) => ({
    id: r.id,
    reportType: r.reportType,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
};

/** Visit **dates only** (04 §6) — never the technician assignment behind them.
 *  `closed` visits drop out: one that was never served is replaced by a
 *  successor row, and showing both would promise the customer two appointments
 *  that were really one. */
export const visitDatesForOrder = async (
  db: Db,
  serviceOrderId: string,
): Promise<Date[]> => {
  const rows = await db
    .select({ scheduledStart: scheduledVisits.scheduledStart })
    .from(scheduledVisits)
    .where(
      and(
        eq(scheduledVisits.serviceOrderId, serviceOrderId),
        isNull(scheduledVisits.deletedAt),
        ne(scheduledVisits.status, VisitStatus.Closed),
      ),
    )
    .orderBy(asc(scheduledVisits.scheduledStart));
  return rows.map((r) => r.scheduledStart);
};
