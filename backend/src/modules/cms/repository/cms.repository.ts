import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { cmsClients, cmsDocuments } from '../models/cms.model';
import type { CmsSection } from '../enums/cms.enum';
import type { CmsClientRow, NewCmsClient, UpdateCmsClientFields } from '../types/cms.types';

export const findDocument = async (db: Db, section: CmsSection) => {
  const rows = await db
    .select()
    .from(cmsDocuments)
    .where(eq(cmsDocuments.section, section))
    .limit(1);
  return rows[0] ?? null;
};

export const upsertDraft = async (db: Db, section: CmsSection, draft: unknown) => {
  const now = new Date();
  const [row] = await db
    .insert(cmsDocuments)
    .values({ section, draft, updatedAt: now })
    .onConflictDoUpdate({
      target: cmsDocuments.section,
      set: { draft, updatedAt: now },
    })
    .returning();
  if (!row) throw new Error('upsertDraft returned no row');
  return row;
};

export const upsertPublished = async (db: Db, section: CmsSection, published: unknown) => {
  const now = new Date();
  const [row] = await db
    .insert(cmsDocuments)
    .values({ section, published, updatedAt: now, publishedAt: now })
    .onConflictDoUpdate({
      target: cmsDocuments.section,
      set: { published, publishedAt: now },
    })
    .returning();
  if (!row) throw new Error('upsertPublished returned no row');
  return row;
};

export const listCmsClients = async (db: Db): Promise<CmsClientRow[]> => {
  return db.select().from(cmsClients).orderBy(asc(cmsClients.createdAt));
};

export const insertCmsClient = async (db: Db, input: NewCmsClient): Promise<CmsClientRow> => {
  const [row] = await db.insert(cmsClients).values(input).returning();
  if (!row) throw new Error('insertCmsClient returned no row');
  return row;
};

export const updateCmsClient = async (db: Db, id: string, fields: UpdateCmsClientFields) => {
  const [row] = await db
    .update(cmsClients)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(cmsClients.id, id))
    .returning();
  return row ?? null;
};

// Hard delete — content rows, not audited resources (see cms.model.ts note).
export const deleteCmsClient = async (db: Db, id: string) => {
  const [row] = await db
    .delete(cmsClients)
    .where(eq(cmsClients.id, id))
    .returning({ id: cmsClients.id });
  return row ?? null;
};
