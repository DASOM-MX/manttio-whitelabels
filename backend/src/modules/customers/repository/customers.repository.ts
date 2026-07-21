import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { customers } from '../models/customers.model';
import { customerContacts } from '../models/customer-contacts.model';
import { customerFiscal } from '../models/customer-fiscal.model';
import { customerInteractions } from '../models/customer-interactions.model';
import { InteractionType } from '../enums/interactions.enum';
import type {
  CustomerRow,
  CustomerWithRelations,
  NewContact,
  NewCustomer,
  NewFiscal,
  RecentCustomerRow,
  UpdateCustomerFields,
} from '../types/customers.types';
import type { SystemAudit } from '../types/interactions.types';

// A query executor: the pooled `Db` or a transaction handle — both expose the
// same query builder, so read helpers accept either.
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

// Contacts always come back default-first, then oldest-first.
const contactsOf = (exec: Executor, customerId: string) =>
  exec
    .select()
    .from(customerContacts)
    .where(eq(customerContacts.customerId, customerId))
    .orderBy(desc(customerContacts.isDefault), asc(customerContacts.createdAt));

const fiscalOf = async (exec: Executor, customerId: string) => {
  const [row] = await exec
    .select()
    .from(customerFiscal)
    .where(eq(customerFiscal.customerId, customerId))
    .limit(1);
  return row ?? null;
};

export const listCustomers = async (db: Db): Promise<CustomerRow[]> => {
  return db
    .select()
    .from(customers)
    .where(isNull(customers.deletedAt))
    .orderBy(desc(customers.createdAt));
};

/** Newest client rows for the Panel's recent-clients card (utm-params 03
 *  amendment 2026-07-20). */
export const listRecentCustomers = async (
  db: Db,
  limit: number,
): Promise<RecentCustomerRow[]> =>
  db
    .select({
      id: customers.id,
      name: customers.name,
      contactName: customers.contactName,
      clientType: customers.clientType,
      source: customers.source,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(isNull(customers.deletedAt))
    .orderBy(desc(customers.createdAt))
    .limit(limit);

/** Bare customer row (no relations) — used by the reports/email flows that only
 *  need name/email/timezone, and by test fixtures. */
export const findCustomerById = async (db: Db, id: string): Promise<CustomerRow | null> => {
  const [row] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return row ?? null;
};

export const insertCustomer = async (db: Db, values: NewCustomer): Promise<CustomerRow> => {
  const [row] = await db.insert(customers).values(values).returning();
  if (!row) throw new Error('insertCustomer returned no row');
  return row;
};

export const findCustomerWithRelations = async (
  db: Db,
  id: string,
): Promise<CustomerWithRelations | null> => {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
    .limit(1);
  if (!customer) return null;
  const [contacts, fiscal] = await Promise.all([contactsOf(db, id), fiscalOf(db, id)]);
  return { ...customer, contacts, fiscal };
};

/** Contacts to persist for a customer — already normalized by the service to
 *  exactly one `isDefault`; `customerId` is stamped here. */
export type ContactInput = Omit<NewContact, 'id' | 'customerId' | 'createdAt'>;
export type FiscalInput = Omit<NewFiscal, 'customerId' | 'createdAt' | 'updatedAt'>;

// Append a backend-generated `system` timeline entry inside the caller's tx, so
// the audit record commits atomically with the change that caused it (08 §2).
const insertSystemEntry = (tx: Tx, customerId: string, audit: SystemAudit) =>
  tx.insert(customerInteractions).values({
    customerId,
    type: InteractionType.System,
    body: audit.body,
    refKind: audit.refKind ?? null,
    refId: audit.refId ?? null,
    userId: audit.userId,
  });

export const insertCustomerWithRelations = async (
  db: Db,
  values: NewCustomer,
  contacts: ContactInput[],
  fiscal: FiscalInput | null,
  audit?: SystemAudit,
): Promise<CustomerWithRelations> => {
  return db.transaction(async (tx) => {
    const [customer] = await tx.insert(customers).values(values).returning();
    if (!customer) throw new Error('insertCustomer returned no row');
    if (contacts.length) {
      await tx.insert(customerContacts).values(contacts.map((c) => ({ ...c, customerId: customer.id })));
    }
    if (fiscal) {
      await tx.insert(customerFiscal).values({ ...fiscal, customerId: customer.id });
    }
    if (audit) await insertSystemEntry(tx, customer.id, audit);
    const contactsOut = await contactsOf(tx, customer.id);
    const fiscalOut = await fiscalOf(tx, customer.id);
    return { ...customer, contacts: contactsOut, fiscal: fiscalOut };
  });
};

export const updateCustomerWithRelations = async (
  db: Db,
  id: string,
  fields: UpdateCustomerFields,
  contacts: ContactInput[] | undefined,
  fiscal: FiscalInput | undefined,
  audit?: SystemAudit,
): Promise<CustomerWithRelations | null> => {
  return db.transaction(async (tx) => {
    let customer: CustomerRow | undefined;
    if (Object.keys(fields).length > 0) {
      [customer] = await tx
        .update(customers)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
        .returning();
    } else {
      [customer] = await tx
        .select()
        .from(customers)
        .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
        .limit(1);
    }
    if (!customer) return null;

    // Wholesale replace: drop the old default first, then insert the new set with
    // its single default — never two defaults live at once (partial unique index).
    if (contacts !== undefined) {
      await tx.delete(customerContacts).where(eq(customerContacts.customerId, id));
      if (contacts.length) {
        await tx.insert(customerContacts).values(contacts.map((c) => ({ ...c, customerId: id })));
      }
    }
    if (fiscal !== undefined) {
      await tx
        .insert(customerFiscal)
        .values({ ...fiscal, customerId: id })
        .onConflictDoUpdate({
          target: customerFiscal.customerId,
          set: { ...fiscal, updatedAt: new Date() },
        });
    }
    if (audit) await insertSystemEntry(tx, id, audit);

    const contactsOut = await contactsOf(tx, id);
    const fiscalOut = await fiscalOf(tx, id);
    return { ...customer, contacts: contactsOut, fiscal: fiscalOut };
  });
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
