import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { customers } from '../models/customers.model';
import type { CustomerRow, NewCustomer, UpdateCustomerFields } from '../types/customers.types';

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
