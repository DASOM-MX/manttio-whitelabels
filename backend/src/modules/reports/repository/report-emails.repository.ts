import { and, desc, eq, isNull, or, gt, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { reportEmails } from '../models/report-emails.model';
import { reports } from '../models/reports.model';
import type { NewReportEmail, ReportEmailRow } from '../types/reports.types';

export const insertReportEmail = async (
  db: Db,
  input: NewReportEmail,
): Promise<ReportEmailRow> => {
  const [row] = await db.insert(reportEmails).values(input).returning();
  if (!row) throw new Error('insertReportEmail returned no row');
  return row;
};

export const setResendMessageId = async (db: Db, id: string, resendMessageId: string) => {
  await db
    .update(reportEmails)
    .set({ resendMessageId })
    .where(eq(reportEmails.id, id));
};

export const listEmailsForReport = async (db: Db, reportId: string) => {
  return db
    .select()
    .from(reportEmails)
    .where(eq(reportEmails.reportId, reportId))
    .orderBy(desc(reportEmails.sentAt));
};

// Fetches an email by its access token AND ensures the parent report is not soft-deleted.
// Returns the email row and the report row (header) — caller can then load details.
export const findEmailByToken = async (db: Db, token: string) => {
  const rows = await db
    .select({ email: reportEmails, report: reports })
    .from(reportEmails)
    .innerJoin(reports, eq(reports.id, reportEmails.reportId))
    .where(
      and(
        eq(reportEmails.accessToken, token),
        isNull(reports.deletedAt),
        isNull(reportEmails.revokedAt),
        or(isNull(reportEmails.expiresAt), gt(reportEmails.expiresAt, sql`now()`)),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
};

export const revokeEmail = async (db: Db, id: string) => {
  const [row] = await db
    .update(reportEmails)
    .set({ revokedAt: new Date() })
    .where(and(eq(reportEmails.id, id), isNull(reportEmails.revokedAt)))
    .returning({ id: reportEmails.id });
  return row ?? null;
};
