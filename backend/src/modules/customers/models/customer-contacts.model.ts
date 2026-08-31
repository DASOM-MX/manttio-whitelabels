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
  },
  (table) => [
    index('customer_contacts_customer_idx').on(table.customerId),
    // At most one default contact per customer.
    uniqueIndex('customer_contacts_one_default_idx')
      .on(table.customerId)
      .where(sql`${table.isDefault}`),
    // A16 (2026-08-31): contacts are unique per email tenant-wide. One email =
    // one contact = one portal account. Allows NULL (contacts without an address
    // are unaffected).
    uniqueIndex('customer_contacts_email_uidx').on(table.email),
  ],
);
