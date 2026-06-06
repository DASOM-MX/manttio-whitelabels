import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../client';
import { customers } from '../schema';

export type CustomerRow = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type UpdateCustomerFields = Partial<
  Pick<
    CustomerRow,
    | 'name'
    | 'identification'
    | 'phone'
    | 'email'
    | 'observation'
    | 'address'
    | 'state'
    | 'razonSocial'
    | 'timezone'
  >
>;

export const findCustomerById = async (db: Db, id: string) => {
  const rows = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return rows[0] ?? null;
};

export const listCustomers = async (db: Db) => {
  return db
    .select()
    .from(customers)
    .where(isNull(customers.deletedAt))
    .orderBy(desc(customers.createdAt));
};

export const insertCustomer = async (db: Db, input: NewCustomer): Promise<CustomerRow> => {
  const [row] = await db.insert(customers).values(input).returning();
  if (!row) throw new Error('insertCustomer returned no row');
  return row;
};

export const updateCustomer = async (db: Db, id: string, fields: UpdateCustomerFields) => {
  const [row] = await db
    .update(customers)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
    .returning();
  return row ?? null;
};

export const deleteCustomer = async (db: Db, id: string) => {
  const now = new Date();
  const [row] = await db
    .update(customers)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
    .returning({ id: customers.id });
  return row ?? null;
};
