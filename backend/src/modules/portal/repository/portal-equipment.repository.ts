import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { equipment, equipmentReports } from '../../equipment/models/equipment.model';
import type { EquipmentRow } from '../../equipment/types/equipment.types';
import { reports } from '../../reports/models/reports.model';
import { serviceRequests } from '../../service-requests/models/service-requests.model';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import type { PortalEquipmentLinkedServiceRequest } from '../dtos/portal-equipment.dto';
import type { PortalLinkedReport } from '../dtos/portal-report.dto';
import { PORTAL_REPORT_STATUSES } from '../constants/portal-visibility';
import type { PortalEquipmentQuery } from '../validators/portal-reads.validator';

/** A unit plus its derived "último servicio" (04 §7's list column). */
export interface PortalEquipmentRow {
  row: EquipmentRow;
  lastServiceDate: Date | null;
}

// Scope + release. `retired` units stay visible — 04 §2 excludes soft-deleted
// rows only, and a decommissioned unit's history is exactly what a customer
// looks the section up for.
const visible = (customerId: string): SQL =>
  and(eq(equipment.customerId, customerId), isNull(equipment.deletedAt))!;

// Newest RELEASED report against this unit. Unreleased work is invisible in the
// portal, so it must not date a unit either.
const lastServiceExpr = sql<Date | string | null>`(
  select max(coalesce(${reports.dateArrival}, ${reports.finishedAt}, ${reports.createdAt}))
  from ${equipmentReports}
  join ${reports} on ${reports.id} = ${equipmentReports.reportId}
  where ${equipmentReports.equipmentId} = ${equipment.id}
    and ${reports.deletedAt} is null
    and ${inArray(reports.status, PORTAL_REPORT_STATUSES)}
)`;

// pg hands back a Date for timestamptz, but the aggregate is typed loosely —
// normalize once here so the mapper only ever sees a Date.
const toDate = (value: Date | string | null): Date | null => {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
};

const filters = (customerId: string, q: PortalEquipmentQuery): SQL => {
  const conds: SQL[] = [visible(customerId)];
  if (q.location) conds.push(ilike(equipment.location, `%${q.location}%`));
  if (q.search) {
    const term = `%${q.search}%`;
    const match = or(
      ilike(equipment.name, term),
      ilike(equipment.brand, term),
      ilike(equipment.model, term),
      ilike(equipment.serialNumber, term),
    );
    if (match) conds.push(match);
  }
  return and(...conds)!;
};

export const listPortalEquipment = async (
  db: Db,
  customerId: string,
  q: PortalEquipmentQuery,
): Promise<GenericQueryResponse<PortalEquipmentRow>> => {
  const where = filters(customerId, q);

  const rows = await db
    .select({ row: equipment, lastServiceDate: lastServiceExpr })
    .from(equipment)
    .where(where)
    .orderBy(desc(equipment.createdAt))
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);

  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(equipment)
    .where(where);

  return {
    items: rows.map((r) => ({ row: r.row, lastServiceDate: toDate(r.lastServiceDate) })),
    total: count?.total ?? 0,
    page: q.page,
    limit: q.limit,
  };
};

export const findPortalEquipment = async (
  db: Db,
  customerId: string,
  id: string,
): Promise<PortalEquipmentRow | null> => {
  const [row] = await db
    .select({ row: equipment, lastServiceDate: lastServiceExpr })
    .from(equipment)
    .where(and(eq(equipment.id, id), visible(customerId)))
    .limit(1);
  return row ? { row: row.row, lastServiceDate: toDate(row.lastServiceDate) } : null;
};

/** The unit's released reports, newest first (04 §7). The caller only asks for
 *  these when the user holds `view_reports`. */
export const releasedReportsForEquipment = async (
  db: Db,
  customerId: string,
  equipmentId: string,
): Promise<PortalLinkedReport[]> => {
  const rows = await db
    .select({
      id: reports.id,
      reportType: reports.reportType,
      status: reports.status,
      createdAt: reports.createdAt,
    })
    .from(equipmentReports)
    .innerJoin(reports, eq(reports.id, equipmentReports.reportId))
    .where(
      and(
        eq(equipmentReports.equipmentId, equipmentId),
        eq(reports.clientId, customerId),
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

/** The unit's own requests, newest first (04 §7). The caller only asks for these
 *  when the user holds `create_service_requests`; the request module's own
 *  endpoints land in 06. */
export const serviceRequestsForEquipment = async (
  db: Db,
  customerId: string,
  equipmentId: string,
): Promise<PortalEquipmentLinkedServiceRequest[]> => {
  const rows = await db
    .select({
      id: serviceRequests.id,
      folio: serviceRequests.folio,
      status: serviceRequests.status,
      createdAt: serviceRequests.createdAt,
    })
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.equipmentId, equipmentId),
        eq(serviceRequests.customerId, customerId),
      ),
    )
    .orderBy(desc(serviceRequests.createdAt));
  return rows.map((r) => ({
    id: r.id,
    folio: r.folio,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
};
