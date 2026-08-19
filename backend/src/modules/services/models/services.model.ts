import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../../users/models/users.model';
import { ServiceTaxRate, ServiceUom } from '../enums/services.enum';

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
    // Closed list (`ServiceUom`), validator-enforced — the column stays `text`
    // so adding a unit needs no DDL.
    uom: text('uom').$type<ServiceUom>().notNull(),
    // Management copy — never reaches the website.
    description: text('description'),
    // The public card copy. A listed service without one renders title-only;
    // there is deliberately no fallback to the internal `description`.
    websiteDescription: text('website_description'),
    // The public card photo — an R2 key in `manttio-images` (via POST
    // /upload/website-image), never a URL: the CDN base is per-deploy, so the URL
    // is materialized on read and the stored key survives a CDN move. Same
    // posture as `cms_clients.logo_key`; absent → the card renders text-only.
    websiteImageKey: text('website_image_key'),
    // Tenant catalog code, internal only. Unique when set — partial index below.
    internalServiceCode: text('internal_service_code'),
    taxRate: text('tax_rate').$type<ServiceTaxRate>().notNull().default(ServiceTaxRate.Iva16),
    // CFDI catalog keys (c_ClaveProdServ / c_ClaveUnidad). Catalog attributes,
    // not invoice ones — carrying them here spares 09 a hand-backfill. No v1 UI.
    satProdServCode: text('sat_prod_serv_code'),
    satUnitCode: text('sat_unit_code'),
    // Does a unit of this service produce a REPORT of its own (19 §2, owner
    // 2026-07-31)? True for jobs a technician performs and documents (a
    // maintenance, an installation); false for what an order merely charges —
    // labor by the hour, refrigerant by the kilo, freight. Before this flag,
    // quantity did double duty as money multiplier AND job count, so "2 horas
    // de mano de obra" exploded two phantom report skeletons. Defaults FALSE
    // (owner 2026-08-18): a service is only a charge until someone says it is
    // a job, so every service created from here on is opt-in. Migration 0036
    // still backfills the rows that predate the column to true — before the
    // flag every line exploded — so no existing order changes meaning.
    isReportSource: boolean('is_report_source').notNull().default(false),
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
    // Live catalog only: nulls are exempt (the field is optional) and
    // tombstoned rows release their code for reuse.
    uniqueIndex('services_internal_code_uidx')
      .on(table.internalServiceCode)
      .where(sql`${table.internalServiceCode} is not null and ${table.deletedAt} is null`),
  ],
);
