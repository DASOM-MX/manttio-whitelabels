import type { Db } from '../../database/client';
import type {
  CustomerContactDto,
  CustomerDto,
  CustomerFiscalDto,
} from '../dtos/customer.dto';
import {
  findCustomerById,
  findFiscalByCustomerIds,
  insertCustomer,
  listContactsByCustomerIds,
  listCustomers,
  replaceContacts,
  softDeleteCustomer,
  updateCustomer,
  upsertFiscal,
  deleteFiscal,
} from '../repository/customers.repository';
import type {
  CustomerContactRow,
  CustomerFiscalRow,
  CustomerRow,
  ListCustomersFilters,
  NewCustomer,
  UpdateCustomerFields,
} from '../types/customers.types';
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from '../validators/customers.validator';

// ---- mappers ----

const mapFiscal = (row: CustomerFiscalRow): CustomerFiscalDto => ({
  rfc: row.rfc,
  legalName: row.legalName,
  taxRegimeCode: row.taxRegimeCode,
  fiscalZip: row.fiscalZip,
  cfdiUseCode: row.cfdiUseCode,
  billingEmail: row.billingEmail,
});

const mapContact = (row: CustomerContactRow): CustomerContactDto => ({
  id: row.id,
  name: row.name,
  role: row.role,
  phone: row.phone,
  email: row.email,
});

const toDto = (
  row: CustomerRow,
  contacts: CustomerContactRow[],
  fiscal: CustomerFiscalRow | null,
): CustomerDto => ({
  id: row.id,
  name: row.name,
  contactName: row.contactName,
  identification: row.identification,
  phone: row.phone,
  email: row.email,
  observation: row.observation,
  address: row.address,
  state: row.state,
  razonSocial: row.razonSocial,
  timezone: row.timezone,
  status: row.status,
  source: row.source,
  blacklistReason: row.blacklistReason,
  nextFollowUpAt: row.nextFollowUpAt ? row.nextFollowUpAt.toISOString() : null,
  tags: row.tags,
  fiscal: fiscal ? mapFiscal(fiscal) : null,
  contacts: contacts.map(mapContact),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
});

// Base (non-relational) columns pulled from a validated payload. Undefined
// entries are omitted so DB defaults (status/source/tags) apply on insert.
const toBaseFields = (
  input: CreateCustomerInput | UpdateCustomerInput,
): UpdateCustomerFields => {
  const f: UpdateCustomerFields = {};
  if (input.name !== undefined) f.name = input.name;
  if (input.contactName !== undefined) f.contactName = input.contactName;
  if (input.identification !== undefined) f.identification = input.identification;
  if (input.phone !== undefined) f.phone = input.phone;
  if (input.email !== undefined) f.email = input.email;
  if (input.observation !== undefined) f.observation = input.observation;
  if (input.address !== undefined) f.address = input.address;
  if (input.state !== undefined) f.state = input.state;
  if (input.razonSocial !== undefined) f.razonSocial = input.razonSocial;
  if (input.timezone !== undefined) f.timezone = input.timezone;
  if (input.status !== undefined) f.status = input.status;
  if (input.source !== undefined) f.source = input.source;
  if (input.blacklistReason !== undefined) f.blacklistReason = input.blacklistReason;
  if (input.nextFollowUpAt !== undefined) {
    f.nextFollowUpAt = new Date(input.nextFollowUpAt);
  }
  if (input.tags !== undefined) f.tags = input.tags;
  return f;
};

// ---- reads ----

export interface PagedCustomers {
  customers: CustomerDto[];
  total: number;
  page: number;
  limit: number | null;
}

export const getCustomers = async (
  db: Db,
  query: ListCustomersQuery,
): Promise<PagedCustomers> => {
  const filters: ListCustomersFilters = {
    page: query.page,
    limit: query.limit,
    search: query.search,
    status: query.status,
    source: query.source,
    tags: query.tags,
  };
  const { rows, total } = await listCustomers(db, filters);
  const ids = rows.map((r) => r.id);
  const fiscalRows = await findFiscalByCustomerIds(db, ids);
  const fiscalById = new Map(fiscalRows.map((f) => [f.customerId, f]));

  // List rows carry fiscal (for the RFC column) but not the contacts list —
  // contacts are a detail-view concern.
  const customers = rows.map((row) => toDto(row, [], fiscalById.get(row.id) ?? null));
  return { customers, total, page: query.page ?? 1, limit: query.limit ?? null };
};

export const getCustomerById = async (db: Db, id: string): Promise<CustomerDto | null> => {
  const row = await findCustomerById(db, id);
  if (!row) return null;
  const [contacts, fiscalRows] = await Promise.all([
    listContactsByCustomerIds(db, [id]),
    findFiscalByCustomerIds(db, [id]),
  ]);
  return toDto(row, contacts, fiscalRows[0] ?? null);
};

// ---- writes ----

export const createCustomer = async (
  db: Db,
  input: CreateCustomerInput,
): Promise<CustomerDto> => {
  const id = await db.transaction(async (tx) => {
    const base = toBaseFields(input) as NewCustomer; // name is required by the schema
    const row = await insertCustomer(tx, base);
    if (input.contacts !== undefined) await replaceContacts(tx, row.id, input.contacts);
    if (input.fiscal) await upsertFiscal(tx, { customerId: row.id, ...input.fiscal });
    return row.id;
  });
  const dto = await getCustomerById(db, id);
  if (!dto) throw new Error('createCustomer: row vanished after insert');
  return dto;
};

export const editCustomer = async (
  db: Db,
  id: string,
  input: UpdateCustomerInput,
): Promise<CustomerDto | null> => {
  const updated = await db.transaction(async (tx) => {
    const base = toBaseFields(input);
    // Base update also guards existence (returns null for missing/deleted).
    const row =
      Object.keys(base).length > 0
        ? await updateCustomer(tx, id, base)
        : await findCustomerById(tx, id);
    if (!row) return false;

    if (input.contacts !== undefined) await replaceContacts(tx, id, input.contacts);
    if (input.fiscal !== undefined) {
      if (input.fiscal === null) await deleteFiscal(tx, id);
      else await upsertFiscal(tx, { customerId: id, ...input.fiscal });
    }
    return true;
  });
  if (!updated) return null;
  return getCustomerById(db, id);
};

export const removeCustomer = async (
  db: Db,
  id: string,
  deletedBy: string | null,
  comment: string | null,
): Promise<{ id: string } | null> => {
  return softDeleteCustomer(db, id, deletedBy, comment);
};
