import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../client';
import { users } from '../schema';

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UpdateUserFields = Partial<Pick<UserRow, 'name' | 'email' | 'passwordHash' | 'role'>>;

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
// attribution stays intact. Returns null if the user was already deleted/missing.
export const softDeleteUser = async (db: Db, id: string) => {
  const now = new Date();
  const [row] = await db
    .update(users)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(users.id, id), activeFilter))
    .returning({ id: users.id });
  return row ?? null;
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'technician';
  createdAt: Date;
  updatedAt: Date;
};

export const toPublicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
});
