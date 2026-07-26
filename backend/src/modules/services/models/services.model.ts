import { sql } from 'drizzle-orm';
import { boolean, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../users/models/users.model';
import { ServiceTaxRate } from '../enums/services.enum';

// The tenant's service catalog (18 §1) — what the business sells, priced per
// unit of measure. Flat: no categories or variants in v1. Quotations (20) and
// orders (19) FK here *and* snapshot the price sold at, so repricing or
// soft-deleting a service never rewrites history.
//
// Applied directly to the shared Neon DB (ahead-of-migrations rule) — no
// drizzle migration file is generated from here.
export const services = pgTable(
  'services',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    // MXN implicit, single currency in v1. Drizzle maps `numeric` to a TS
    // string and it stays one all the way to the API — no float rounds a peso.
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    // Margin input for quote/order lines. Back-office tier only — the DTO omits
    // it for technicians (18 §2).
    cost: numeric('cost', { precision: 12, scale: 2 }),
    // Free text ('servicio', 'hora', 'visita'…) — no invented catalog, same as
    // `equipment.kind`.
    uom: text('uom').notNull(),
    description: text('description'),
    taxRate: text('tax_rate').$type<ServiceTaxRate>().notNull().default(ServiceTaxRate.Iva16),
    // CFDI catalog keys (c_ClaveProdServ / c_ClaveUnidad). Catalog attributes,
    // not invoice ones — carrying them here spares 09 a hand-backfill. No v1 UI.
    satProdServCode: text('sat_prod_serv_code'),
    satUnitCode: text('sat_unit_code'),
    // Public website listing (15). Price visibility is independent of listing —
    // a listed service may still hide its number — and only meaningful while
    // listed; the service layer forces it false otherwise.
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
