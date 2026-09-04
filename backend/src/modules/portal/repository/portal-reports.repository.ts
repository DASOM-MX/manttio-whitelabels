import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../database/client';
import { equipment, equipmentReports } from '../../equipment/models/equipment.model';
import { reportDetails, reports } from '../../reports/models/reports.model';
import type { ReportDetailRow } from '../../reports/types/reports.types';
import { users } from '../../users/models/users.model';
import { displayName } from '../../users/utils/display-name';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import { PORTAL_REPORT_STATUSES } from '../constants/portal-visibility';
import { portalPage, portalRow, portalScope } from './portal-reads.repository';
import type { PortalReportsQuery } from '../validators/portal-reads.validator';
import type {
  PortalReportRow,
  PortalReportSelectRow,
  PortalTechnicianColumns,
} from '../types/portal-reads.types';

// Scope + release in one predicate, applied by every read here: the token's
// customer, live rows, delivered statuses only (02 §4, 04 §2).
const visible = (customerId: string): SQL =>
  portalScope({ customer: reports.clientId, deletedAt: reports.deletedAt }, customerId, {
    column: reports.status,
    statuses: PORTAL_REPORT_STATUSES,
  });

const technicianName = {
  name: users.name,
  paternalLastName: users.paternalLastName,
  maternalLastName: users.maternalLastName,
};

// The join is left, so the whole group is null when the technician row is gone.
const nameOf = (u: PortalTechnicianColumns | null): string | null =>
  u ? displayName(u) || null : null;

// One select shape for the list and the detail, so the two cannot drift.
const reportColumns = { row: reports, technician: technicianName };

const toPortalReportRow = (r: PortalReportSelectRow): PortalReportRow => ({
  row: r.row,
  technicianName: nameOf(r.technician),
});

const filters = (customerId: string, q: PortalReportsQuery): SQL => {
  const conds: SQL[] = [visible(customerId)];
  if (q.equipmentId) {
    conds.push(sql`exists (
      select 1 from ${equipmentReports}
      where ${equipmentReports.reportId} = ${reports.id}
        and ${equipmentReports.equipmentId} = ${q.equipmentId}
    )`);
  }
  // Inclusive calendar bounds — the end day counts in full.
  if (q.dateFrom) conds.push(sql`${reports.dateArrival} >= ${q.dateFrom}::date`);
  if (q.dateTo) conds.push(sql`${reports.dateArrival} < (${q.dateTo}::date + 1)`);
  if (q.search) {
    const term = `%${q.search}%`;
    const match = or(ilike(reports.id, `${q.search}%`), ilike(reports.reportType, term));
    if (match) conds.push(match);
  }
  return and(...conds)!;
};

export const listPortalReports = async (
  db: Db,
  customerId: string,
  q: PortalReportsQuery,
): Promise<GenericQueryResponse<PortalReportRow>> => {
  const where = filters(customerId, q);
  return portalPage(
    db,
    reports,
    where,
    q,
    db
      .select(reportColumns)
      .from(reports)
      .leftJoin(users, eq(users.id, reports.assignedTo))
      .where(where)
      .orderBy(desc(reports.createdAt))
      .$dynamic(),
    toPortalReportRow,
  );
};

/** The units a page of reports covered, in one round trip. Reports with no
 *  linked unit are absent; callers default to `[]`. */
export const equipmentNamesForReports = async (
  db: Db,
  reportIds: string[],
): Promise<Map<string, string[]>> => {
  const grouped = new Map<string, string[]>();
  if (!reportIds.length) return grouped;
  const rows = await db
    .select({ reportId: equipmentReports.reportId, name: equipment.name })
    .from(equipmentReports)
    .innerJoin(equipment, eq(equipment.id, equipmentReports.equipmentId))
    .where(and(inArray(equipmentReports.reportId, reportIds), isNull(equipment.deletedAt)));
  for (const { reportId, name } of rows) {
    if (!name) continue;
    const names = grouped.get(reportId);
    if (names) names.push(name);
    else grouped.set(reportId, [name]);
  }
  return grouped;
};

/** One report, scope- and release-checked. Takes a `DbOrTx` so the PDF route can
 *  run it inside the transaction that appends the download event. */
export const findPortalReport = async (
  runner: DbOrTx,
  customerId: string,
  id: string,
): Promise<PortalReportRow | null> =>
  portalRow(
    runner
      .select(reportColumns)
      .from(reports)
      .leftJoin(users, eq(users.id, reports.assignedTo))
      .where(and(eq(reports.id, id), visible(customerId)))
      .$dynamic(),
    toPortalReportRow,
  );

/** The answered template snapshot, pictures and signature. Read separately from
 *  the header so the list never pays for the jsonb. */
export const findPortalReportContent = async (
  db: Db,
  reportId: string,
): Promise<ReportDetailRow | null> => {
  const [row] = await db
    .select()
    .from(reportDetails)
    .where(eq(reportDetails.reportId, reportId))
    .limit(1);
  return row ?? null;
};
