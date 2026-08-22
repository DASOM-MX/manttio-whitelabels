import { sql } from 'drizzle-orm';
import { numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { MaterialTracking } from '../enums/materials.enum';

// Material catalog (10-wms/01 §2). `tracking` decides where its stock lives:
// serialized → `material_units`, lot → `material_lots`, unserialized →
// `stock_entries` — and is IMMUTABLE once the material has any movement
// (`409 tracking_immutable`; the UI locks it right after create, 05 §3).
// Soft delete only at zero stock everywhere (`409 material_has_stock`).
export const materials = pgTable(
  'materials',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // The INTERNAL code (nullable — not every material has one).
    sku: text('sku'),
    // The scanned barcode (added 2026-07-19, owner ask): GTIN digits
    // (UPC-A/EAN-8/EAN-13/GTIN-14), validator `^\d{8,14}$`, stored as text —
    // leading zeros matter. Searches and imports resolve it alongside `sku`.
    upc: text('upc'),
    name: text('name').notNull(),
    description: text('description'),
    // Display unit (`'pza'`, `'m'`, `'kg'`, …). Free text ≥1 char; the UI
    // offers a curated suggestion list but doesn't restrict (10 §4).
    unit: text('unit').notNull(),
    tracking: text('tracking').$type<MaterialTracking>().notNull(),
    // Low-stock pill threshold on TOTAL stock (00 §6 #24 — `lowStock` is
    // computed, never stored). Whole integers in v1 (#22).
    minStock: numeric('min_stock', { precision: 12, scale: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // `409 sku_in_use` / `409 upc_in_use` — live rows only, so a deleted
    // material frees its codes.
    uniqueIndex('materials_sku_uidx')
      .on(table.sku)
      .where(sql`${table.deletedAt} is null and ${table.sku} is not null`),
    uniqueIndex('materials_upc_uidx')
      .on(table.upc)
      .where(sql`${table.deletedAt} is null and ${table.upc} is not null`),
  ],
);
