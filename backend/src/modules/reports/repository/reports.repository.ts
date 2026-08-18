import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { ReportStatus } from '../enums/reports.enum';
import { reportCounters, reportDetails, reports } from '../models/reports.model';
import { users } from '../../users/models/users.model';
import { customers } from '../../customers/models/customers.model';
import { formatReportId } from '../utils/report-id';
import type {
  CustomerReportDTO,
  NewReport,
  NewReportDetail,
  ReportDetailRow,
  ReportFilters,
  ReportRow,
  ReportSummaryRow,
  SignedLocation,
} from '../types/reports.types';

const activeFilter = isNull(reports.deletedAt);

const dayString = (d: Date) => d.toISOString().slice(0, 10);

/** Paged report list for the browsers (superadmin + field app).
 *
 *  Returns `ReportSummaryRow`s, not raw `reports` rows: the list surfaces the
 *  customer and technician *names*, so both are joined here rather than left to
 *  N+1 lookups in the caller. `templateName` is `report_type` — the denormalized
 *  template name frozen at capture (03 decision 2), never a join against the live
 *  template, which would drift away from what the report actually asked. */
export const listReports = async (
  db: Db,
  filters: ReportFilters = {},
  opts: { page: number; limit: number },
): Promise<{ items: ReportSummaryRow[]; total: number }> => {
  const conds = [activeFilter];
  if (filters.status) conds.push(eq(reports.status, filters.status));
  if (filters.clientId) conds.push(eq(reports.clientId, filters.clientId));
  if (filters.assignedTo) conds.push(eq(reports.assignedTo, filters.assignedTo));
  if (filters.templateId) conds.push(eq(reports.templateId, filters.templateId));
  if (filters.workType) conds.push(eq(reports.workType, filters.workType));
  if (filters.state) conds.push(eq(reports.state, filters.state));
  if (filters.folio) conds.push(ilike(reports.id, `${filters.folio}%`));
  if (filters.dateFrom) conds.push(gte(reports.dateArrival, filters.dateFrom));
  if (filters.dateTo) conds.push(lte(reports.dateArrival, filters.dateTo));
  // Free-text box: folio prefix OR customer/technician name substring.
  if (filters.search) {
    const term = `%${filters.search}%`;
    conds.push(
      or(
        ilike(reports.id, `${filters.search}%`),
        ilike(customers.name, term),
        ilike(users.name, term),
      )!,
    );
  }

  const where = and(...conds);
  const joined = () =>
    db
      .select({
        id: reports.id,
        templateId: reports.templateId,
        templateName: reports.reportType,
        reportType: reports.reportType,
        workType: reports.workType,
        status: reports.status,
        state: reports.state,
        clientId: reports.clientId,
        customerName: customers.name,
        assignedTo: reports.assignedTo,
        technicianName: users.name,
        serviceOrderId: reports.serviceOrderId,
        serviceId: reports.serviceId,
        dateArrival: reports.dateArrival,
        finishedAt: reports.finishedAt,
        mailedAt: reports.mailedAt,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .leftJoin(customers, eq(customers.id, reports.clientId))
      .leftJoin(users, eq(users.id, reports.assignedTo))
      .where(where);

  const items = await joined()
    .orderBy(desc(reports.createdAt))
    .limit(opts.limit)
    .offset((opts.page - 1) * opts.limit);

  // Count over the same joins so a name-matching `search` counts consistently.
  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(reports)
    .leftJoin(customers, eq(customers.id, reports.clientId))
    .leftJoin(users, eq(users.id, reports.assignedTo))
    .where(where);

  return { items, total: count?.total ?? 0 };
};

/** Compact, technician-named report list for one customer (customer 360
 *  "Servicios" tab + equipment retro-link picker). Newest first, active only. */
export const listReportsForCustomer = async (
  db: Db,
  customerId: string,
): Promise<CustomerReportDTO[]> => {
  const rows = await db
    .select({
      id: reports.id,
      reportType: reports.reportType,
      workType: reports.workType,
      status: reports.status,
      dateArrival: reports.dateArrival,
      finishedAt: reports.finishedAt,
      createdAt: reports.createdAt,
      technicianName: users.name,
    })
    .from(reports)
    .leftJoin(users, eq(users.id, reports.assignedTo))
    .where(and(eq(reports.clientId, customerId), activeFilter))
    .orderBy(desc(reports.createdAt));

  return rows.map((r) => ({
    id: r.id,
    folio: r.id,
    // Date-only — the tab and the equipment picker both render a service date.
    serviceDate: (r.dateArrival ?? r.finishedAt ?? r.createdAt).toISOString().slice(0, 10),
    reportType: r.reportType,
    workType: r.workType ?? null,
    technicianName: r.technicianName ?? null,
    status: r.status,
  }));
};

export const findReportById = async (db: Db, id: string) => {
  const rows = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, id), activeFilter))
    .limit(1);
  return rows[0] ?? null;
};

export const findReportWithDetails = async (db: Db, id: string) => {
  const rows = await db
    .select({ report: reports, details: reportDetails })
    .from(reports)
    .leftJoin(reportDetails, eq(reportDetails.reportId, reports.id))
    .where(and(eq(reports.id, id), activeFilter))
    .limit(1);
  if (!rows[0] || !rows[0].details) return null;
  return { report: rows[0].report, details: rows[0].details };
};

// Atomic: counter increment → header insert → details insert. All three share one transaction.
export const createReport = async (
  db: Db,
  header: Omit<NewReport, 'id'>,
  details: Omit<NewReportDetail, 'reportId'>,
  day: Date = new Date(),
): Promise<{ report: ReportRow; details: ReportDetailRow }> => {
  return db.transaction(async (tx) => {
    const [counter] = await tx
      .insert(reportCounters)
      .values({ day: dayString(day), lastNumber: 1 })
      .onConflictDoUpdate({
        target: reportCounters.day,
        set: { lastNumber: sql`${reportCounters.lastNumber} + 1` },
      })
      .returning({ lastNumber: reportCounters.lastNumber });
    if (!counter) throw new Error('createReport: counter upsert returned no row');

    const id = formatReportId(day, counter.lastNumber);

    // Opening a report = being on-site. Default `date_arrival` to now() so the frontend
    // does not have to send it; callers may still override (e.g. PDF imports, backfills).
    const dateArrival = header.dateArrival ?? new Date();

    const [reportRow] = await tx
      .insert(reports)
      .values({ ...header, id, dateArrival })
      .returning();
    if (!reportRow) throw new Error('createReport: header insert returned no row');

    const [detailsRow] = await tx
      .insert(reportDetails)
      .values({ ...details, reportId: id })
      .returning();
    if (!detailsRow) throw new Error('createReport: details insert returned no row');

    return { report: reportRow, details: detailsRow };
  });
};

export const updateReportHeader = async (
  db: Db,
  id: string,
  fields: Partial<
    Pick<ReportRow, 'workType' | 'dateArrival' | 'dateDeparture' | 'clientId' | 'reportType'>
  >,
) => {
  const [row] = await db
    .update(reports)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(reports.id, id), activeFilter))
    .returning();
  return row ?? null;
};

export const updateReportDetailsData = async (
  db: Db,
  reportId: string,
  data: unknown,
) => {
  const now = new Date();
  const [row] = await db
    .update(reportDetails)
    .set({ data, contentFilledAt: sql`coalesce(${reportDetails.contentFilledAt}, now())`, updatedAt: now })
    .where(eq(reportDetails.reportId, reportId))
    .returning();
  return row ?? null;
};

export const reassignReport = async (db: Db, id: string, assignedTo: string) => {
  const [row] = await db
    .update(reports)
    .set({ assignedTo, updatedAt: new Date() })
    .where(and(eq(reports.id, id), activeFilter))
    .returning();
  return row ?? null;
};

// Promote either birth state (`created` from the manual path, `pending` from an
// order explosion) → `in-progress`. Idempotent, and narrow on purpose: a
// `cancelled` or already-finished report is never revived by a content write.
export const bumpToInProgress = async (db: Db, id: string) => {
  await db
    .update(reports)
    .set({ status: ReportStatus.InProgress, updatedAt: new Date() })
    .where(
      and(
        eq(reports.id, id),
        inArray(reports.status, [ReportStatus.Created, ReportStatus.Pending]),
        activeFilter,
      ),
    );
};

export const markFinished = async (
  db: Db,
  id: string,
  signedBy: string,
  signatureUrl: string,
  location: SignedLocation,
) => {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [reportRow] = await tx
      .update(reports)
      .set({
        status: ReportStatus.Finished,
        finishedAt: now,
        signedAt: now,
        // Signing the report = leaving the site. The frontend no longer collects
        // `date_departure` manually; it is stamped here.
        dateDeparture: now,
        signedBy,
        signedLatitude: location.latitude,
        signedLongitude: location.longitude,
        signedAccuracy: location.accuracy ?? null,
        updatedAt: now,
      })
      .where(and(eq(reports.id, id), activeFilter))
      .returning();
    if (!reportRow) return null;

    const [detailsRow] = await tx
      .update(reportDetails)
      .set({ signature: signatureUrl, updatedAt: now })
      .where(eq(reportDetails.reportId, id))
      .returning();
    if (!detailsRow) throw new Error('markFinished: details row missing');

    return { report: reportRow, details: detailsRow };
  });
};

export const markMailed = async (db: Db, id: string) => {
  const now = new Date();
  await db
    .update(reports)
    .set({ status: ReportStatus.Mailed, mailedAt: now, updatedAt: now })
    .where(and(eq(reports.id, id), eq(reports.status, ReportStatus.Finished), activeFilter));
};

export const appendPictures = async (
  db: Db,
  reportId: string,
  newUrls: string[],
) => {
  if (newUrls.length === 0) return null;
  const now = new Date();
  const [row] = await db
    .update(reportDetails)
    .set({
      pictures: sql`${reportDetails.pictures} || ${newUrls}::text[]`,
      contentFilledAt: sql`coalesce(${reportDetails.contentFilledAt}, now())`,
      updatedAt: now,
    })
    .where(eq(reportDetails.reportId, reportId))
    .returning();
  return row ?? null;
};

export const removePictures = async (
  db: Db,
  reportId: string,
  removeUrls: string[],
) => {
  if (removeUrls.length === 0) return null;
  const now = new Date();
  const [row] = await db
    .update(reportDetails)
    .set({
      pictures: sql`(select coalesce(array_agg(p), '{}') from unnest(${reportDetails.pictures}) p where p <> all(${removeUrls}::text[]))`,
      updatedAt: now,
    })
    .where(eq(reportDetails.reportId, reportId))
    .returning();
  return row ?? null;
};

export const softDeleteReport = async (db: Db, id: string) => {
  const now = new Date();
  const [row] = await db
    .update(reports)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(reports.id, id), activeFilter))
    .returning({ id: reports.id });
  return row ?? null;
};
