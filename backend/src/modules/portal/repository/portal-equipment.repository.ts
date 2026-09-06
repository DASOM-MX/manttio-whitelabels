import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { equipment, equipmentReports } from '../../equipment/models/equipment.model';
import { reports } from '../../reports/models/reports.model';
import { serviceRequests } from '../../service-requests/models/service-requests.model';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import type { PortalEquipmentLinkedServiceRequest } from '../dtos/portal-equipment.dto';
import type { PortalLinkedReport } from '../dtos/portal-report.dto';
import { PORTAL_REPORT_STATUSES } from '../constants/portal-visibility';
import { portalPage, portalRow, portalScope } from './portal-reads.repository';
import type { PortalEquipmentQuery } from '../validators/portal-reads.validator';
import type {
  PortalEquipmentRow,
  PortalEquipmentSelectRow,
} from '../types/portal-reads.types';

// Scope + release. `retired` units stay visible — 04 §2 excludes soft-deleted
// rows only, and a decommissioned unit's history is exactly what a customer
// looks the section up for.
const visible = (customerId: string): SQL =>
  portalScope({ customer: equipment.customerId, deletedAt: equipment.deletedAt }, customerId);

// Newest RELEASED report against this unit. Unreleased work is invisible in the
// portal, so it must not date a unit either.
// Query builder, not a raw template: Drizzle leaves an interpolated column
// unqualified in a single-table select, which made this subquery ambiguous.
const lastServiceExpr = (db: Db): SQL<Date | string | null> =>
  sql<Date | string | null>`${db
    .select({
      lastService: sql`max(coalesce(${reports.dateArrival}, ${reports.finishedAt}, ${reports.createdAt}))`,
    })
    .from(equipmentReports)
    .innerJoin(reports, eq(reports.id, equipmentReports.reportId))
    .where(
      and(
        eq(equipmentReports.equipmentId, equipment.id),
        isNull(reports.deletedAt),
        inArray(reports.status, PORTAL_REPORT_STATUSES),
      ),
    )}`;

// pg hands back a Date for timestamptz, but the aggregate is typed loosely —
// normalize once here so the mapper only ever sees a Date.
const toDate = (value: Date | string | null): Date | null => {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
};

// One select shape and one mapper for the list and the detail, so the two
// cannot drift apart. Takes `db` because the correlated subquery is built with
// the query builder.
const equipmentColumns = (db: Db) => ({ row: equipment, lastServiceDate: lastServiceExpr(db) });

const toPortalEquipmentRow = (r: PortalEquipmentSelectRow): PortalEquipmentRow => ({
  row: r.row,
  lastServiceDate: toDate(r.lastServiceDate),
});

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
  return portalPage(
    db,
    equipment,
    where,
    q,
    db
      .select(equipmentColumns(db))
      .from(equipment)
      .where(where)
      .orderBy(desc(equipment.createdAt))
      .$dynamic(),
    toPortalEquipmentRow,
  );
};

export const findPortalEquipment = async (
  db: Db,
  customerId: string,
  id: string,
): Promise<PortalEquipmentRow | null> =>
  portalRow(
    db
      .select(equipmentColumns(db))
      .from(equipment)
      .where(and(eq(equipment.id, id), visible(customerId)))
      .$dynamic(),
    toPortalEquipmentRow,
  );

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
