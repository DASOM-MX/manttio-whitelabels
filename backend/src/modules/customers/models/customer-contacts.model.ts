import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { customers } from './customers.model';

// Contacts for a customer (superadmin "Contactos"). Multi-row; exactly one is
// flagged `is_default` (the primary contact) — enforced by the partial unique
// index below. The customer's denormalized `contact_name`/`phone`/`email` mirror
// the default contact so single-field consumers (list, field app) stay in sync.
export const customerContacts = pgTable(
  'customer_contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    name: text('name').notNull(),
    role: text('role'),
    phone: text('phone'),
    email: text('email'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Soft delete (2026-09-01). Contacts used to be hard-deleted and re-inserted
    // wholesale on every customer PATCH, which broke the fork's no-hard-delete
    // rule and, worse, could not run at all for a customer whose contact was on
    // a quotation: `quotation_recipients.contact_id` and
    // `quotation_events.contact_id` are both `onDelete: 'restrict'`, so the
    // DELETE raised a foreign-key violation. Retiring a contact now tombstones
    // the row, which keeps those references resolvable for historical display.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('customer_contacts_customer_idx').on(table.customerId),
    // At most one default contact per customer — among LIVE rows. Without the
    // `deleted_at` clause a tombstoned default would hold the slot forever and
    // no replacement could be promoted.
    uniqueIndex('customer_contacts_one_default_idx')
      .on(table.customerId)
      .where(sql`${table.isDefault} and ${table.deletedAt} is null`),
    // A16 (2026-08-31): contacts are unique per email tenant-wide. One email =
    // one contact = one portal account. Allows NULL (contacts without an address
    // are unaffected). Scoped to live rows since soft delete landed — otherwise
    // a retired contact would permanently reserve its address and the same
    // person could never be re-added.
    uniqueIndex('customer_contacts_email_uidx')
      .on(table.email)
      .where(sql`${table.deletedAt} is null`),
  ],
);
