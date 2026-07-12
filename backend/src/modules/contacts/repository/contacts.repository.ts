import { asc, eq, inArray } from 'drizzle-orm';
import type { DbClient } from '../../database/client';
import { contacts } from '../models/contact.model';
import type { ContactRow, NewContact, UpdateContactFields } from '../types/contacts.types';

export const listContactsByCustomerIds = async (
  db: DbClient,
  ids: string[],
): Promise<ContactRow[]> => {
  if (ids.length === 0) return [];
  return db.select().from(contacts).where(inArray(contacts.customerId, ids));
};

export const listContactsForCustomer = async (
  db: DbClient,
  customerId: string,
): Promise<ContactRow[]> => {
  return db
    .select()
    .from(contacts)
    .where(eq(contacts.customerId, customerId))
    .orderBy(asc(contacts.createdAt));
};

// Contacts are addressed by their own (global) uuid — no parent needed.
export const findContactById = async (db: DbClient, id: string): Promise<ContactRow | null> => {
  const rows = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  return rows[0] ?? null;
};

export const insertContact = async (db: DbClient, input: NewContact): Promise<ContactRow> => {
  const [row] = await db.insert(contacts).values(input).returning();
  if (!row) throw new Error('insertContact returned no row');
  return row;
};

export const updateContactById = async (
  db: DbClient,
  id: string,
  fields: UpdateContactFields,
): Promise<ContactRow | null> => {
  if (Object.keys(fields).length === 0) return findContactById(db, id);
  const [row] = await db.update(contacts).set(fields).where(eq(contacts.id, id)).returning();
  return row ?? null;
};

export const deleteContactById = async (
  db: DbClient,
  id: string,
): Promise<{ id: string } | null> => {
  const [row] = await db
    .delete(contacts)
    .where(eq(contacts.id, id))
    .returning({ id: contacts.id });
  return row ?? null;
};

// Wholesale replace — used by the customers create/update path when contacts
// are supplied inline.
export const replaceContacts = async (
  db: DbClient,
  customerId: string,
  rows: Omit<NewContact, 'customerId'>[],
): Promise<void> => {
  await db.delete(contacts).where(eq(contacts.customerId, customerId));
  if (rows.length > 0) {
    await db.insert(contacts).values(rows.map((r) => ({ ...r, customerId })));
  }
};
