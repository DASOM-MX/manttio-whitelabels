import type { Db } from '../../database/client';
import { isUniqueViolation } from '../../database/db-errors';
import {
  deleteCustomer,
  findCustomerById,
  findCustomerWithRelations,
  insertCustomerWithRelations,
  listCustomerOptions,
  listCustomersPaged,
  listRecentCustomers,
  updateCustomerWithRelations,
  type ContactInput,
  type FiscalInput,
} from '../repository/customers.repository';
import { DuplicateEmailError } from '../http-errors/duplicate-email.error';
import { notifyBestEffort } from '../../notifications/services/notifications.service';
import { NotificationType } from '../../notifications/enums/notifications.enum';
import { findUserById } from '../../users/repository/users.repository';
import { displayName } from '../../users/utils/display-name';
import type {
  CustomerOption,
  CustomerRow,
  CustomerWithRelations,
  NewCustomer,
  RecentCustomerRow,
  UpdateCustomerFields,
} from '../types/customers.types';
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from '../validators/customers.validator';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';

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
    email: c.email?.trim() || null,
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
  clientType: input.clientType,
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
  if (input.clientType !== undefined) fields.clientType = input.clientType;
  if (input.nextFollowUpAt !== undefined)
    fields.nextFollowUpAt = input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null;
  if (input.timezone !== undefined) fields.timezone = input.timezone;
  if (input.contactName !== undefined) fields.contactName = input.contactName;
  if (input.phone !== undefined) fields.phone = input.phone;
  if (input.email !== undefined) fields.email = input.email;
  return fields;
};

/** Human-readable body for the `system` audit entry an edit emits (08 §2). The
 *  targeted single-field PATCHes (follow-up, contacts) get a specific line; a
 *  full-form edit gets the generic one. */
const auditBodyForEdit = (input: UpdateCustomerInput): string => {
  const keys = Object.keys(input);
  if (keys.length === 1 && keys[0] === 'contacts') return 'Contactos actualizados';
  if (keys.length === 1 && keys[0] === 'nextFollowUpAt') {
    return input.nextFollowUpAt
      ? `Seguimiento programado: ${input.nextFollowUpAt.slice(0, 10)}`
      : 'Seguimiento eliminado';
  }
  return 'Cliente actualizado';
};

export const getCustomersPaged = async (
  db: Db,
  query: ListCustomersQuery,
): Promise<GenericQueryResponse<CustomerRow>> => listCustomersPaged(db, query);

/** The whole roster for pickers (21 §3). A bare array, not an envelope: there
 *  is no page, no limit, and a `total` could only ever be the array's own
 *  length, so even an `{ items }` wrapper is a level of nesting that carries no
 *  information (owner, 2026-08-25). Roster reads and query reads are different
 *  contracts — see `GenericQueryResponse` for the latter. */
export const getCustomerOptions = async (db: Db): Promise<CustomerOption[]> =>
  listCustomerOptions(db);

/** Latest registered clients (utm-params 03 amendment — the Panel card). */
export const getRecentCustomers = async (
  db: Db,
  limit: number,
): Promise<RecentCustomerRow[]> => listRecentCustomers(db, limit);

export const getCustomerById = async (
  db: Db,
  id: string,
): Promise<CustomerWithRelations | null> => findCustomerWithRelations(db, id);

export const createCustomer = async (
  db: Db,
  input: CreateCustomerInput,
  actorId: string,
): Promise<CustomerWithRelations> => {
  try {
    const contacts = normalizeContacts(input.contacts);
    const values = buildNewCustomer(input, primaryOf(contacts));
    const customer = await insertCustomerWithRelations(
      db,
      values,
      contacts,
      normalizeFiscal(input.fiscal) ?? null,
      {
        userId: actorId,
        body: 'Cliente creado',
      },
    );
    // Owner awareness feed (notifications plan §1 note): owner broadcast, the
    // acting user excluded; the body names who did it (owner ask, 2026-07-21).
    const actor = await findUserById(db, actorId);
    await notifyBestEffort(db, {
      role: 'owner',
      excludeUserId: actorId,
      type: NotificationType.ClientRegisteredFromSuperadmin,
      title: 'Cliente registrado',
      body: actor
        ? `${customer.name} fue dado de alta por ${displayName(actor)}.`
        : `${customer.name} fue dado de alta.`,
      data: { customerId: customer.id },
    });
    return customer;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateEmailError();
    throw err;
  }
};

export const editCustomer = async (
  db: Db,
  id: string,
  input: UpdateCustomerInput,
  actorId: string,
): Promise<CustomerWithRelations | null> => {
  try {
    const fields = collectScalarUpdates(input);
    if (input.status !== undefined) {
      // statusChangedAt stamps only on an actual transition, so it keeps meaning
      // "when the status last changed" even if clients resend the same status.
      const current = await findCustomerById(db, id);
      if (current && current.status !== input.status) {
        fields.statusChangedAt = new Date();
      }
    }
    const contacts = input.contacts !== undefined ? normalizeContacts(input.contacts) : undefined;
    if (contacts !== undefined) Object.assign(fields, contactMirror(primaryOf(contacts)));
    const updated = await updateCustomerWithRelations(
      db,
      id,
      fields,
      contacts,
      normalizeFiscal(input.fiscal),
      {
        userId: actorId,
        body: auditBodyForEdit(input),
      },
    );
    if (updated) {
      const actor = await findUserById(db, actorId);
      await notifyBestEffort(db, {
        role: 'owner',
        excludeUserId: actorId,
        type: NotificationType.ClientUpdated,
        title: 'Cliente actualizado',
        body: actor
          ? `${displayName(actor)} actualizó los datos de ${updated.name}.`
          : `Se actualizaron los datos de ${updated.name}.`,
        data: { customerId: updated.id },
      });
    }
    return updated;
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateEmailError();
    throw err;
  }
};

export const removeCustomer = async (
  db: Db,
  id: string,
  actorId: string,
): Promise<{ id: string } | null> => {
  // The name outlives the soft delete, but read it up front so the notice
  // never depends on tombstone-filtered reads.
  const current = await findCustomerById(db, id);
  const removed = await deleteCustomer(db, id);
  if (removed) {
    await notifyBestEffort(db, {
      role: 'owner',
      excludeUserId: actorId,
      type: NotificationType.ClientArchived,
      title: 'Cliente archivado',
      body: `${current?.name ?? 'Un cliente'} fue archivado.`,
      data: { customerId: id },
    });
  }
  return removed;
};
