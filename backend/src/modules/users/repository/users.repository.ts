import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { users } from '../models/users.model';
import type { Role } from '../enums/users.enum';
import type { NewUser, UpdateUserFields, UserRow } from '../types/users.types';

const activeFilter = isNull(users.deletedAt);

export const findUserByEmail = async (db: Db, email: string) => {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), activeFilter))
    .limit(1);
  return rows[0] ?? null;
};

export const findUserById = async (db: Db, id: string) => {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), activeFilter))
    .limit(1);
  return rows[0] ?? null;
};

export const listUsers = async (db: Db) => {
  return db.select().from(users).where(activeFilter).orderBy(desc(users.createdAt));
};

/** Active users holding any of the given roles — the notifications module's
 *  role-broadcast resolution (notifications plan §2.1). */
export const listActiveUsersByRoles = async (db: Db, roles: Role[]) => {
  if (roles.length === 0) return [];
  return db
    .select()
    .from(users)
    .where(and(inArray(users.role, roles), activeFilter));
};

export const insertUser = async (db: Db, input: NewUser): Promise<UserRow> => {
  const [row] = await db.insert(users).values(input).returning();
  if (!row) throw new Error('insertUser returned no row');
  return row;
};

export const updateUser = async (db: Db, id: string, fields: UpdateUserFields) => {
  const [row] = await db
    .update(users)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(users.id, id), activeFilter))
    .returning();
  return row ?? null;
};

// Soft delete. Reports.{created_by,assigned_to} FKs still resolve, so historical
// attribution stays intact. The deleteComment is required at the route layer
// (Zod) and stored alongside deletedAt + deletedBy for audit. Returns null if
// the user was already deleted/missing.
export const softDeleteUser = async (
  db: Db,
  id: string,
  deleteComment: string,
  deletedBy: string,
) => {
  const now = new Date();
  const [row] = await db
    .update(users)
    .set({ deletedAt: now, deleteComment, deletedBy, updatedAt: now })
    .where(and(eq(users.id, id), activeFilter))
    .returning({ id: users.id });
  return row ?? null;
};
