import { and, arrayOverlaps, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { customers } from '../models/customers.model';
import { customerContacts } from '../models/customer-contacts.model';
import { customerFiscal } from '../models/customer-fiscal.model';
import { customerInteractions } from '../models/customer-interactions.model';
import { InteractionType } from '../enums/interactions.enum';
import type {
  ContactRow,
  CustomerRow,
  CustomerWithRelations,
  NewContact,
  NewCustomer,
  NewFiscal,
  CustomerOption,
  RecentCustomerRow,
  UpdateCustomerFields,
} from '../types/customers.types';
import type { SystemAudit } from '../types/interactions.types';
import type { ListCustomersQuery } from '../validators/customers.validator';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';

// A query executor: the pooled `Db` or a transaction handle — both expose the
// same query builder, so read helpers accept either.
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

// Contacts always come back default-first, then oldest-first. Live rows only —
// tombstones stay readable through the quotation joins that reference them, but
// they are not part of the customer's roster.
const contactsOf = (exec: Executor, customerId: string) =>
  exec
    .select()
    .from(customerContacts)
    .where(and(eq(customerContacts.customerId, customerId), isNull(customerContacts.deletedAt)))
    .orderBy(desc(customerContacts.isDefault), asc(customerContacts.createdAt));

const fiscalOf = async (exec: Executor, customerId: string) => {
  const [row] = await exec
    .select()
    .from(customerFiscal)
    .where(eq(customerFiscal.customerId, customerId))
    .limit(1);
  return row ?? null;
};

/** The whole live roster, name-sorted — the unpaged read behind every customer
 *  picker (21 §3). Projected rather than `select()`: a picker never needs the
 *  CRM columns, and this response is the one that scales with the tenant.
 *  Name-sorted because it is read as a list of choices, not a feed. */
export const listCustomerOptions = async (db: Db): Promise<CustomerOption[]> =>
  db
    .select({
      id: customers.id,
      name: customers.name,
      contactName: customers.contactName,
      razonSocial: customers.razonSocial,
      identification: customers.identification,
      phone: customers.phone,
      email: customers.email,
      state: customers.state,
      status: customers.status,
      timezone: customers.timezone,
    })
    .from(customers)
    .where(isNull(customers.deletedAt))
    .orderBy(asc(customers.name));

/** The clients list (07 §2) — newest-first, filtered, one page at a time.
 *  Mirrors `listUsersPaged`: one `SQL[]` filter list feeding both the page
 *  query and the count, so `total` can never drift from what was filtered.
 *
 *  This replaces the former `listCustomers(db)`, which returned every live row
 *  and made the list page render the same ten clients on every page (21 §1).
 *  The whole roster still has a route — `listCustomerOptions` — it is just no
 *  longer what the browse read does. */
export const listCustomersPaged = async (
  db: Db,
  query: ListCustomersQuery,
): Promise<GenericQueryResponse<CustomerRow>> => {
  const filters: SQL[] = [isNull(customers.deletedAt)];
  if (query.status) filters.push(eq(customers.status, query.status));
  if (query.source) filters.push(eq(customers.source, query.source));
  // `&&` — any of the given tags, not all of them: the filter is a chip set the
  // user widens by adding chips.
  if (query.tags) filters.push(arrayOverlaps(customers.tags, query.tags));
  if (query.search) {
    const term = `%${query.search}%`;
    const match = or(
      ilike(customers.name, term),
      ilike(customers.contactName, term),
      ilike(customers.email, term),
      ilike(customers.phone, term),
      ilike(customers.identification, term),
    );
    if (match) filters.push(match);
  }
  const where = and(...filters);

  const items = await db
    .select()
    .from(customers)
    .where(where)
    // Served by customers_active_idx.
    .orderBy(desc(customers.createdAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(where);

  return {
    items,
    total: countRows[0]?.count ?? 0,
    page: query.page,
    limit: query.limit,
  };
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

    // Wholesale replace: retire the current set, then insert the new one with its
    // single default — never two live defaults at once (partial unique index).
    //
    // Tombstone, not DELETE (2026-09-01). The old hard delete broke the fork's
    // no-hard-delete rule, and could not even run for a customer whose contact
    // sat on a quotation — `quotation_recipients.contact_id` and
    // `quotation_events.contact_id` are `onDelete: 'restrict'`, so editing such
    // a customer raised a foreign-key violation. Tombstoning keeps those rows
    // resolvable, so a sent quote still renders the name it was addressed to.
    //
    // Note this still mints NEW ids for the replacement rows, so a
    // `portal_users.contact_id` pointer goes stale exactly as decision 26
    // anticipated — it now points at a tombstone instead of at nothing.
    if (contacts !== undefined) {
      await tx
        .update(customerContacts)
        .set({ deletedAt: new Date() })
        .where(and(eq(customerContacts.customerId, id), isNull(customerContacts.deletedAt)));
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
