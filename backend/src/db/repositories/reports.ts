import { and, desc, eq, gte, ilike, isNull, lte, sql } from 'drizzle-orm';
import type { Db } from '../client';
import { reportCounters, reportDetails, reports } from '../schema';
import { formatReportId } from '../../lib/report-id';
import type { ReportStatus } from '../../lib/report-lifecycle';

export type ReportRow = typeof reports.$inferSelect;
export type ReportDetailRow = typeof reportDetails.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type NewReportDetail = typeof reportDetails.$inferInsert;

export type ReportFilters = {
  status?: ReportStatus;
  clientId?: string;
  assignedTo?: string;
  workType?: string;
  // Folio (report id) prefix match. e.g. `R-20260503` returns all of that day.
  folio?: string;
  // Date range filters apply to `date_arrival`. Either bound is optional.
  dateFrom?: Date;
  dateTo?: Date;
};

const activeFilter = isNull(reports.deletedAt);

const dayString = (d: Date) => d.toISOString().slice(0, 10);

export const listReports = async (db: Db, filters: ReportFilters = {}) => {
  const conds = [activeFilter];
  if (filters.status) conds.push(eq(reports.status, filters.status));
  if (filters.clientId) conds.push(eq(reports.clientId, filters.clientId));
  if (filters.assignedTo) conds.push(eq(reports.assignedTo, filters.assignedTo));
  if (filters.workType) conds.push(eq(reports.workType, filters.workType));
  if (filters.folio) conds.push(ilike(reports.id, `${filters.folio}%`));
  if (filters.dateFrom) conds.push(gte(reports.dateArrival, filters.dateFrom));
  if (filters.dateTo) conds.push(lte(reports.dateArrival, filters.dateTo));
  return db
    .select()
    .from(reports)
    .where(and(...conds))
    .orderBy(desc(reports.createdAt));
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

    const [reportRow] = await tx
      .insert(reports)
      .values({ ...header, id })
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

// Promote `created` → `in-progress` if needed. Idempotent.
export const bumpToInProgress = async (db: Db, id: string) => {
  await db
    .update(reports)
    .set({ status: 'in-progress', updatedAt: new Date() })
    .where(and(eq(reports.id, id), eq(reports.status, 'created'), activeFilter));
};

export type SignedLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
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
        status: 'finished',
        finishedAt: now,
        signedAt: now,
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
    .set({ status: 'mailed', mailedAt: now, updatedAt: now })
    .where(and(eq(reports.id, id), eq(reports.status, 'finished'), activeFilter));
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
