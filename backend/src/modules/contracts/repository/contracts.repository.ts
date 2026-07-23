import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { contracts } from '../models/contracts.model';
import { customers } from '../../customers/models/customers.model';
import type { ContractRow, NewContract, UpdateContractFields } from '../types/contracts.types';

const activeFilter = isNull(contracts.deletedAt);

// A row of the contracts table plus its derived customer name.
export interface ContractMetaRow {
  row: ContractRow;
  customerName: string | null;
}

const metaColumns = {
  row: contracts,
  customerName: customers.name,
};

export const listContracts = async (
  db: Db,
  filters: { search?: string; customerId?: string; tag?: string },
  page: number,
  limit: number,
): Promise<{ items: ContractMetaRow[]; total: number }> => {
  const conds = [activeFilter];
  if (filters.customerId) conds.push(eq(contracts.customerId, filters.customerId));
  // Exact containment — this is what the GIN index answers.
  if (filters.tag) conds.push(sql`${contracts.tags} @> array[${filters.tag}]::text[]`);
  if (filters.search) {
    const q = `%${filters.search}%`;
    const match = or(
      ilike(contracts.description, q),
      ilike(contracts.fileName, q),
      sql`exists (select 1 from unnest(${contracts.tags}) as t(tag) where t.tag ilike ${q})`,
    );
    if (match) conds.push(match);
  }
  const where = and(...conds);

  const items = await db
    .select(metaColumns)
    .from(contracts)
    .leftJoin(customers, eq(customers.id, contracts.customerId))
    .where(where)
    .orderBy(desc(contracts.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contracts)
    .where(where);

  return { items, total: countRows[0]?.count ?? 0 };
};

export const findContractWithMeta = async (
  db: Db,
  id: string,
): Promise<ContractMetaRow | null> => {
  const [row] = await db
    .select(metaColumns)
    .from(contracts)
    .leftJoin(customers, eq(customers.id, contracts.customerId))
    .where(and(eq(contracts.id, id), activeFilter))
    .limit(1);
  return row ?? null;
};

export const insertContract = async (db: Db, values: NewContract): Promise<ContractRow> => {
  const [row] = await db.insert(contracts).values(values).returning();
  if (!row) throw new Error('insertContract returned no row');
  return row;
};

export const updateContract = async (
  db: Db,
  id: string,
  fields: UpdateContractFields,
): Promise<ContractRow | null> => {
  const [row] = await db
    .update(contracts)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(contracts.id, id), activeFilter))
    .returning();
  return row ?? null;
};

export const softDeleteContract = async (
  db: Db,
  id: string,
  deleteComment: string,
  deletedBy: string,
): Promise<{ id: string } | null> => {
  const now = new Date();
  const [row] = await db
    .update(contracts)
    .set({ deletedAt: now, updatedAt: now, deleteComment, deletedBy })
    .where(and(eq(contracts.id, id), activeFilter))
    .returning({ id: contracts.id });
  return row ?? null;
};
