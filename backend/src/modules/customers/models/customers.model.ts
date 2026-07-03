import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    identification: text('identification'),
    phone: text('phone'),
    email: text('email'),
    observation: text('observation'),
    address: text('address'),
    state: text('state'),
    razonSocial: text('razon_social'),
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
