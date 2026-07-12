import type { Db, DbClient } from '../../database/client';
import { findCustomerById } from '../../customers/repository/customers.repository';
import type { ContactDto } from '../dtos/contact.dto';
import { CustomerNotFoundError } from '../http-errors/customer-not-found.error';
import {
  deleteContactById,
  findContactById,
  insertContact,
  listContactsForCustomer,
  replaceContacts,
  updateContactById,
} from '../repository/contacts.repository';
import type { ContactRow, UpdateContactFields } from '../types/contacts.types';
import type {
  CreateContactInput,
  NestedContactInput,
  UpdateContactInput,
} from '../validators/contacts.validator';

const toDto = (row: ContactRow): ContactDto => ({
  id: row.id,
  name: row.name,
  role: row.role,
  phone: row.phone,
  email: row.email,
});

// ---- consumed by the customers module (composition) ----

/** Contacts for a customer, as DTOs — used by the customer detail response and
 *  the GET /contacts?customerId= endpoint. */
export const listContacts = async (db: DbClient, customerId: string): Promise<ContactDto[]> => {
  const rows = await listContactsForCustomer(db, customerId);
  return rows.map(toDto);
};

/** Replace a customer's contacts wholesale — used by the customers create/update
 *  path when contacts are supplied inline (runs inside that transaction). */
export const replaceContactsForCustomer = (
  db: DbClient,
  customerId: string,
  rows: NestedContactInput[],
): Promise<void> =>
  replaceContacts(
    db,
    customerId,
    rows.map((c) => ({ name: c.name, role: c.role, phone: c.phone, email: c.email })),
  );

// ---- first-class endpoints ----

export const getContact = async (db: Db, id: string): Promise<ContactDto | null> => {
  const row = await findContactById(db, id);
  return row ? toDto(row) : null;
};

export const addContact = async (db: Db, input: CreateContactInput): Promise<ContactDto> => {
  // FK-validate the parent so a bad id is a clean 404, not a raw FK error.
  const customer = await findCustomerById(db, input.customerId);
  if (!customer) throw new CustomerNotFoundError();
  const row = await insertContact(db, {
    customerId: input.customerId,
    name: input.name,
    role: input.role,
    phone: input.phone,
    email: input.email,
  });
  return toDto(row);
};

export const editContact = async (
  db: Db,
  id: string,
  input: UpdateContactInput,
): Promise<ContactDto | null> => {
  const fields: UpdateContactFields = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.role !== undefined) fields.role = input.role;
  if (input.phone !== undefined) fields.phone = input.phone;
  if (input.email !== undefined) fields.email = input.email;
  const row = await updateContactById(db, id, fields);
  return row ? toDto(row) : null;
};

export const removeContact = (db: Db, id: string): Promise<{ id: string } | null> =>
  deleteContactById(db, id);
