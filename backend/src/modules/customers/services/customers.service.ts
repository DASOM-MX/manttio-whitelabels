import type { Db } from '../../database/client';
import {
  deleteCustomer,
  findCustomerWithRelations,
  insertCustomerWithRelations,
  listCustomers,
  updateCustomerWithRelations,
  type ContactInput,
  type FiscalInput,
} from '../repository/customers.repository';
import type {
  CustomerRow,
  CustomerWithRelations,
  NewCustomer,
  UpdateCustomerFields,
} from '../types/customers.types';
import type { CreateCustomerInput, UpdateCustomerInput } from '../validators/customers.validator';

/** Exactly one contact carries `isDefault` — the one the client marked, else the
 *  first. Empty in → empty out (backend never forces a contact; the superadmin
 *  form is what requires ≥1). */
const normalizeContacts = (list: CreateCustomerInput['contacts']): ContactInput[] => {
  if (!list || list.length === 0) return [];
  const explicit = list.findIndex((c) => c.isDefault);
  const defaultIdx = explicit >= 0 ? explicit : 0;
  return list.map((c, i) => ({
    name: c.name,
    role: c.role ?? null,
    phone: c.phone ?? null,
    email: c.email ?? null,
    isDefault: i === defaultIdx,
  }));
};

const normalizeFiscal = (fiscal: CreateCustomerInput['fiscal']): FiscalInput | undefined =>
  fiscal ? { ...fiscal, billingEmail: fiscal.billingEmail ?? null } : undefined;

const primaryOf = (contacts: ContactInput[]): ContactInput | null =>
  contacts.find((c) => c.isDefault) ?? null;

/** Denormalized customer-level contact fields, mirrored from the default contact
 *  so single-field consumers (list, field app) stay consistent. */
const contactMirror = (
  primary: ContactInput | null,
): Pick<UpdateCustomerFields, 'contactName' | 'phone' | 'email'> => ({
  contactName: primary?.name ?? null,
  phone: primary?.phone ?? null,
  email: primary?.email ?? null,
});

/** Row to insert on create — scalar fields plus the mirror of the primary
 *  contact (falling back to any client-sent contact fields for the field app). */
const buildNewCustomer = (
  input: CreateCustomerInput,
  primary: ContactInput | null,
): NewCustomer => ({
  name: input.name,
  contactName: primary?.name ?? input.contactName ?? null,
  phone: primary?.phone ?? input.phone ?? null,
  email: primary?.email ?? input.email ?? null,
  identification: input.identification ?? null,
  observation: input.observation ?? null,
  address: input.address ?? null,
  state: input.state ?? null,
  razonSocial: input.razonSocial ?? null,
  tags: input.tags,
  status: input.status,
  source: input.source,
  timezone: input.timezone,
});

/** Scalar (non-relation) customer fields present in the patch. When `contacts`
 *  is also provided, the caller overwrites the mirror fields afterwards. */
const collectScalarUpdates = (input: UpdateCustomerInput): UpdateCustomerFields => {
  const fields: UpdateCustomerFields = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.identification !== undefined) fields.identification = input.identification;
  if (input.observation !== undefined) fields.observation = input.observation;
  if (input.address !== undefined) fields.address = input.address;
  if (input.state !== undefined) fields.state = input.state;
  if (input.razonSocial !== undefined) fields.razonSocial = input.razonSocial;
  if (input.tags !== undefined) fields.tags = input.tags;
  if (input.status !== undefined) fields.status = input.status;
  if (input.source !== undefined) fields.source = input.source;
  if (input.timezone !== undefined) fields.timezone = input.timezone;
  if (input.contactName !== undefined) fields.contactName = input.contactName;
  if (input.phone !== undefined) fields.phone = input.phone;
  if (input.email !== undefined) fields.email = input.email;
  return fields;
};

export const getCustomers = async (db: Db): Promise<CustomerRow[]> => listCustomers(db);

export const getCustomerById = async (
  db: Db,
  id: string,
): Promise<CustomerWithRelations | null> => findCustomerWithRelations(db, id);

export const createCustomer = async (
  db: Db,
  input: CreateCustomerInput,
): Promise<CustomerWithRelations> => {
  const contacts = normalizeContacts(input.contacts);
  const values = buildNewCustomer(input, primaryOf(contacts));
  return insertCustomerWithRelations(db, values, contacts, normalizeFiscal(input.fiscal) ?? null);
};

export const editCustomer = async (
  db: Db,
  id: string,
  input: UpdateCustomerInput,
): Promise<CustomerWithRelations | null> => {
  const fields = collectScalarUpdates(input);
  const contacts = input.contacts !== undefined ? normalizeContacts(input.contacts) : undefined;
  if (contacts !== undefined) Object.assign(fields, contactMirror(primaryOf(contacts)));
  return updateCustomerWithRelations(db, id, fields, contacts, normalizeFiscal(input.fiscal));
};

export const removeCustomer = async (db: Db, id: string): Promise<{ id: string } | null> =>
  deleteCustomer(db, id);
