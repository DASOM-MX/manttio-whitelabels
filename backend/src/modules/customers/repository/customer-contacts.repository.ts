import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { customerContacts } from '../models/customer-contacts.model';
import type { ContactRow } from '../types/customers.types';

/** Queries over `customer_contacts`, the people attached to a customer.
 *
 *  Their own file rather than a corner of `customers.repository.ts`: a contact
 *  is read by callers that have no interest in the customer aggregate — the
 *  portal invite flow reaches for one by id and nothing else — and the customer
 *  repository is already the largest in the module.
 *
 *  Contacts are soft-deleted (2026-09-01): `updateCustomerWithRelations`
 *  replaces the set wholesale by tombstoning the old rows, so every read here
 *  filters `isNull(deletedAt)`. The tombstones exist so the `restrict` FKs from
 *  `quotation_recipients` and `quotation_events` stay resolvable. */

/** A single contact by id, unscoped by customer.
 *
 *  Unscoped on purpose, and only safe for callers that are *establishing* the
 *  customer rather than acting within one — the portal invite copies
 *  `customer_id` off the row it finds here (02 §6.2). Anything operating inside
 *  a known customer must use `findContactsForCustomer`, which is scoped, so
 *  "this contact belongs to a different client" cannot be represented. */
export const findContactById = async (db: Db, id: string): Promise<ContactRow | null> => {
  const [row] = await db
    .select()
    .from(customerContacts)
    .where(and(eq(customerContacts.id, id), isNull(customerContacts.deletedAt)))
    .limit(1);
  return row ?? null;
};

/** The subset of a customer's contacts named by id — the server-side check
 *  behind the quotation recipient picker (20 §4).
 *
 *  Scoped by `customerId` on purpose: it makes "this contact belongs to a
 *  different client" un-representable rather than something every caller has to
 *  remember to verify. The failure it prevents is mailing one client's prices
 *  into another client's inbox, so it fails closed — an id that doesn't match
 *  simply isn't returned, and the caller rejects the whole send. */
export const findContactsForCustomer = async (
  db: Db,
  customerId: string,
  ids: string[],
): Promise<ContactRow[]> => {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(customerContacts)
    .where(
      and(
        eq(customerContacts.customerId, customerId),
        inArray(customerContacts.id, ids),
        isNull(customerContacts.deletedAt),
      ),
    );
};
