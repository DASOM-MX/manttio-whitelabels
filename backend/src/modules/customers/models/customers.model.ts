import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { users } from '../../users/models/users.model';
import { CustomerSource, CustomerStatus } from '../enums/customers.enum';

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    // Primary contact person (quick-action target). Distinct from `name` (the
    // commercial/display name of the account).
    contactName: text('contact_name'),
    identification: text('identification'),
    phone: text('phone'),
    email: text('email'),
    observation: text('observation'),
    address: text('address'),
    state: text('state'),
    razonSocial: text('razon_social'),
    timezone: text('timezone').notNull().default('America/Mexico_City'),
    // ---- CRM fields (plan 07 §1; UI in 08) ----
    status: text('status').$type<CustomerStatus>().notNull().default(CustomerStatus.Active),
    source: text('source').$type<CustomerSource>().notNull().default(CustomerSource.Other),
    blacklistReason: text('blacklist_reason'),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    // Free-form segmentation chips. text[] + GIN index for array-overlap filtering.
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // ---- audit soft-delete (mirrors users; comment optional) ----
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deleteComment: text('delete_comment'),
    deletedBy: uuid('deleted_by').references((): AnyPgColumn => users.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('customers_email_idx').on(table.email),
    index('customers_status_idx').on(table.status),
    index('customers_source_idx').on(table.source),
    index('customers_tags_idx').using('gin', table.tags),
    index('customers_active_idx')
      .on(table.createdAt)
      .where(sql`${table.deletedAt} is null`),
  ],
);
