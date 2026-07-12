import { and, arrayOverlaps, count, desc, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { DbClient } from '../../database/client';
import { customers } from '../models/customers.model';
import { customerContacts } from '../models/customer-contacts.model';
import { customerFiscal } from '../models/customer-fiscal.model';
import type {
  CustomerContactRow,
  CustomerFiscalRow,
  CustomerRow,
  ListCustomersFilters,
  NewCustomer,
  NewCustomerContact,
  NewCustomerFiscal,
  UpdateCustomerFields,
} from '../types/customers.types';

const activeFilters = (filters: ListCustomersFilters): SQL[] => {
  const conditions: SQL[] = [isNull(customers.deletedAt)];
  if (filters.search) {
    const term = `%${filters.search}%`;
    const match = or(
      ilike(customers.name, term),
      ilike(customers.email, term),
      ilike(customers.contactName, term),
    );
    if (match) conditions.push(match);
  }
  if (filters.status) conditions.push(eq(customers.status, filters.status));
  if (filters.source) conditions.push(eq(customers.source, filters.source));
  if (filters.tags && filters.tags.length > 0) {
    conditions.push(arrayOverlaps(customers.tags, filters.tags));
  }
  return conditions;
};

export const listCustomers = async (
  db: DbClient,
  filters: ListCustomersFilters,
): Promise<{ rows: CustomerRow[]; total: number }> => {
  const where = and(...activeFilters(filters));

  const totalRows = await db.select({ value: count() }).from(customers).where(where);
  const total = totalRows[0]?.value ?? 0;

  const base = db.select().from(customers).where(where).orderBy(desc(customers.createdAt));

  // Paged only when a limit is supplied; otherwise the full active list (the
  // main frontend calls GET /customers with no params and expects everything).
  const rows =
    filters.limit !== undefined
      ? await base.limit(filters.limit).offset(((filters.page ?? 1) - 1) * filters.limit)
      : await base;

  return { rows, total };
};

export const findCustomerById = async (db: DbClient, id: string): Promise<CustomerRow | null> => {
  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
};

export const insertCustomer = async (db: DbClient, input: NewCustomer): Promise<CustomerRow> => {
  const [row] = await db.insert(customers).values(input).returning();
  if (!row) throw new Error('insertCustomer returned no row');
  return row;
};

export const updateCustomer = async (
  db: DbClient,
  id: string,
  fields: UpdateCustomerFields,
): Promise<CustomerRow | null> => {
  const [row] = await db
    .update(customers)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
    .returning();
  return row ?? null;
};

export const softDeleteCustomer = async (
  db: DbClient,
  id: string,
  deletedBy: string | null,
  comment: string | null,
): Promise<{ id: string } | null> => {
  const now = new Date();
  const [row] = await db
    .update(customers)
    .set({ deletedAt: now, updatedAt: now, deletedBy, deleteComment: comment })
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
    .returning({ id: customers.id });
  return row ?? null;
};

// ---- contacts ----

export const listContactsByCustomerIds = async (
  db: DbClient,
  ids: string[],
): Promise<CustomerContactRow[]> => {
  if (ids.length === 0) return [];
  return db.select().from(customerContacts).where(inArray(customerContacts.customerId, ids));
};

export const replaceContacts = async (
  db: DbClient,
  customerId: string,
  rows: Omit<NewCustomerContact, 'customerId'>[],
): Promise<void> => {
  await db.delete(customerContacts).where(eq(customerContacts.customerId, customerId));
  if (rows.length > 0) {
    await db.insert(customerContacts).values(rows.map((r) => ({ ...r, customerId })));
  }
};

// ---- fiscal ----

export const findFiscalByCustomerIds = async (
  db: DbClient,
  ids: string[],
): Promise<CustomerFiscalRow[]> => {
  if (ids.length === 0) return [];
  return db.select().from(customerFiscal).where(inArray(customerFiscal.customerId, ids));
};

export const upsertFiscal = async (
  db: DbClient,
  input: NewCustomerFiscal,
): Promise<void> => {
  await db
    .insert(customerFiscal)
    .values(input)
    .onConflictDoUpdate({
      target: customerFiscal.customerId,
      set: {
        rfc: input.rfc,
        legalName: input.legalName,
        taxRegimeCode: input.taxRegimeCode,
        fiscalZip: input.fiscalZip,
        cfdiUseCode: input.cfdiUseCode,
        billingEmail: input.billingEmail ?? null,
        updatedAt: new Date(),
      },
    });
};

export const deleteFiscal = async (db: DbClient, customerId: string): Promise<void> => {
  await db.delete(customerFiscal).where(eq(customerFiscal.customerId, customerId));
};
