import { and, asc, eq, ilike, isNull, or } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { services } from '../models/services.model';
import type {
  NewService,
  PublicServiceRow,
  ServiceRow,
  UpdateServiceFields,
} from '../types/services.types';

const activeFilter = isNull(services.deletedAt);

/** The whole active catalog, name-sorted. No pagination — a service catalog is
 *  tens of rows, and every picker wants all of them (18 §4). */
export const listServices = async (db: Db, filters: { search?: string }): Promise<ServiceRow[]> => {
  const conds = [activeFilter];
  if (filters.search) {
    const q = `%${filters.search}%`;
    const match = or(ilike(services.name, q), ilike(services.description, q));
    if (match) conds.push(match);
  }
  return db
    .select()
    .from(services)
    .where(and(...conds))
    .orderBy(asc(services.name));
};

/** The website-listed subset (18 §4, CP-3). Only the columns the public page may
 *  ever see — `cost`, the SAT keys and the delete audit are never selected, so a
 *  future DTO slip can't leak them. `price` ships raw; the service layer drops it
 *  when the service hides its price. */
export const listPublishedServices = async (db: Db): Promise<PublicServiceRow[]> =>
  db
    .select({
      id: services.id,
      name: services.name,
      description: services.description,
      uom: services.uom,
      price: services.price,
      isPriceVisibleInWebsite: services.isPriceVisibleInWebsite,
    })
    .from(services)
    .where(and(activeFilter, eq(services.isListableInWebsite, true)))
    .orderBy(asc(services.name));

export const findServiceById = async (db: Db, id: string): Promise<ServiceRow | null> => {
  const [row] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, id), activeFilter))
    .limit(1);
  return row ?? null;
};

export const insertService = async (db: Db, values: NewService): Promise<ServiceRow> => {
  const [row] = await db.insert(services).values(values).returning();
  if (!row) throw new Error('insertService returned no row');
  return row;
};

export const updateService = async (
  db: Db,
  id: string,
  fields: UpdateServiceFields,
): Promise<ServiceRow | null> => {
  const [row] = await db
    .update(services)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(services.id, id), activeFilter))
    .returning();
  return row ?? null;
};

export const softDeleteService = async (
  db: Db,
  id: string,
  deleteComment: string,
  deletedBy: string,
): Promise<{ id: string } | null> => {
  const now = new Date();
  const [row] = await db
    .update(services)
    .set({ deletedAt: now, updatedAt: now, deleteComment, deletedBy })
    .where(and(eq(services.id, id), activeFilter))
    .returning({ id: services.id });
  return row ?? null;
};
