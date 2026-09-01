import { eq } from 'drizzle-orm';
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
 *  Note there is no `deleted_at` on this table (01 §0): contacts are replaced
 *  wholesale by `updateCustomerWithRelations`, not soft-deleted, so no read here
 *  filters on one. */

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
    .where(eq(customerContacts.id, id))
    .limit(1);
  return row ?? null;
};
