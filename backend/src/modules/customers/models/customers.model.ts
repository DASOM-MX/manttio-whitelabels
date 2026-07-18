import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { CustomerSource, CustomerStatus } from '../enums/customers.enum';

// NOTE: the shared Neon DB already carries `contact_name`, `status`, `source`
// and `tags` (added out-of-band by the manager/upstream) — this model just
// catches up so the API reads/writes them. `tags` is a Postgres text[]. No
// migration is generated from here; the live schema is the source of truth.
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    // Primary contact person's name (superadmin "Contacto"); the customer's own
    // `phone`/`email` double as that contact's channels.
    contactName: text('contact_name'),
    identification: text('identification'),
    phone: text('phone'),
    email: text('email'),
    observation: text('observation'),
    address: text('address'),
    state: text('state'),
    razonSocial: text('razon_social'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: text('status').$type<CustomerStatus>().notNull().default(CustomerStatus.Active),
    source: text('source').$type<CustomerSource>().notNull().default(CustomerSource.Other),
    // CRM (08): the blacklist reason (set via POST /:id/status) and the single
    // follow-up date (08 §3). Both already live in the shared DB.
    blacklistReason: text('blacklist_reason'),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    timezone: text('timezone').notNull().default('America/Mexico_City'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('customers_email_idx').on(table.email),
    index('customers_active_idx')
      .on(table.createdAt)
      .where(sql`${table.deletedAt} is null`),
  ],
);
