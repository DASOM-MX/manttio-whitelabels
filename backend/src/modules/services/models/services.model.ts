import { sql } from 'drizzle-orm';
import { boolean, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users/models/users.model';
import { ServiceTaxRate } from '../enums/services.enum';

// The tenant's service catalog (18 §1) — what the business sells, priced per
// unit of measure. Deliberately flat: no categories or variants in v1.
// Quotations (20) and the orders they generate (19) FK to `services.id` *and*
// snapshot the price they were sold at, so a repriced or soft-deleted service
// never rewrites history.
//
// Applied directly to the shared Neon DB (ahead-of-migrations rule); no drizzle
// migration file is generated from here.
export const services = pgTable(
  'services',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    // First money columns in the schema (18 §1). MXN implicit — single currency
    // in v1. Drizzle maps `numeric` to a TS string; it stays a string all the
    // way to the API so no float ever rounds a peso amount.
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    // Internal cost, for margin on quotation/order lines (decided 2026-07-25).
    // Nullable — not every service has one loaded. Back-office tier only: the
    // DTO omits it for technicians (18 §2).
    cost: numeric('cost', { precision: 12, scale: 2 }),
    // Free text in v1 ('servicio', 'hora', 'equipo', 'visita'…) — same posture
    // as `equipment.kind`, no invented catalog.
    uom: text('uom').notNull(),
    description: text('description'),
    taxRate: text('tax_rate').$type<ServiceTaxRate>().notNull().default(ServiceTaxRate.Iva16),
    // SAT CFDI catalog keys (decided 2026-07-25): c_ClaveProdServ and
    // c_ClaveUnidad. Carried on the catalog — where they belong — so
    // facturación (09) doesn't require an accountant to hand-backfill every
    // service later. Optional, and not surfaced in the v1 dialog.
    satProdServCode: text('sat_prod_serv_code'),
    satUnitCode: text('sat_unit_code'),
    // Feeds the future public website services section (15). Price visibility
    // is independent of listing (decided 2026-07-23) — a listed service may
    // still hide its number. Only meaningful while `isListableInWebsite` is
    // true; the service layer forces it false otherwise.
    isListableInWebsite: boolean('is_listable_in_website').notNull().default(false),
    isPriceVisibleInWebsite: boolean('is_price_visible_in_website').notNull().default(false),
    // Audited soft delete, same shape as users/equipment.
    deleteComment: text('delete_comment'),
    deletedBy: uuid('deleted_by').references(() => users.id),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('services_name_idx')
      .on(table.name)
      .where(sql`${table.deletedAt} is null`),
  ],
);
