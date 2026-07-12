import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { customers } from './customers.model';

// Additional people on an account (B2B: facility mgr, AP, owner). The primary
// contact stays denormalized on `customers.contactName`; these are the extras
// (plan 07 §1). Owned by the customer — replaced wholesale on update, cascade
// on hard delete (customer delete is soft, so cascade only fires on cleanup).
export const customerContacts = pgTable(
  'customer_contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role'),
    phone: text('phone'),
    email: text('email'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('customer_contacts_customer_idx').on(table.customerId)],
);
