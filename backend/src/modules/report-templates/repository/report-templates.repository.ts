import { desc, eq, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { reportTemplates } from '../models/report-templates.model';
import type { NewReportTemplate, ReportTemplateRow, TemplateSection } from '../types/report-templates.types';
import type { TemplateStatus } from '../enums/report-templates.enum';

export const findTemplateById = async (db: Db, id: string): Promise<ReportTemplateRow | null> => {
  const rows = await db.select().from(reportTemplates).where(eq(reportTemplates.id, id)).limit(1);
  return rows[0] ?? null;
};

export const listTemplates = async (
  db: Db,
  opts: { status?: TemplateStatus; page: number; limit: number },
): Promise<{ items: ReportTemplateRow[]; total: number }> => {
  const where: SQL | undefined = opts.status ? eq(reportTemplates.status, opts.status) : undefined;
  const items = await db
    .select()
    .from(reportTemplates)
    .where(where)
    .orderBy(desc(reportTemplates.createdAt))
    .limit(opts.limit)
    .offset((opts.page - 1) * opts.limit);
  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(reportTemplates)
    .where(where);
  return { items, total: count?.total ?? 0 };
};

export const insertTemplate = async (
  db: Db,
  input: NewReportTemplate,
): Promise<ReportTemplateRow> => {
  const [row] = await db.insert(reportTemplates).values(input).returning();
  if (!row) throw new Error('insertTemplate returned no row');
  return row;
};

export const updateTemplateContent = async (
  db: Db,
  id: string,
  fields: { name: string; description: string | null; sections: TemplateSection[] },
): Promise<ReportTemplateRow | null> => {
  const [row] = await db
    .update(reportTemplates)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(reportTemplates.id, id))
    .returning();
  return row ?? null;
};

export const updateTemplateStatus = async (
  db: Db,
  id: string,
  fields: Partial<
    Pick<ReportTemplateRow, 'status' | 'disabledReason' | 'disabledBy' | 'disabledAt'>
  >,
): Promise<ReportTemplateRow | null> => {
  const [row] = await db
    .update(reportTemplates)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(reportTemplates.id, id))
    .returning();
  return row ?? null;
};
