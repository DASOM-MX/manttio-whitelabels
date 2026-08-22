import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../../users/models/users.model';
import { materials } from './materials.model';
import { replenishmentImports } from './replenishment-imports.model';
import { storageNodes } from './storage-nodes.model';
import { warehouses } from './warehouses.model';

// The confirmed bulk-restock DOCUMENT (10-wms/01 §2) — minted by the approval
// transaction from a `ready` import. NO `deletedAt`: it is document trail;
// corrections happen via readjustments, never edits. Source-file facts
// (name/mapping) live on the import row — the view reads the join.
export const replenishments = pgTable('replenishments', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Per-tenant consecutive, incremented from `wms_counters` inside the confirm
  // transaction (00 §6 #7 — the `report_counters` pattern, module-local).
  folio: integer('folio').notNull().unique(),
  warehouseId: uuid('warehouse_id')
    .notNull()
    .references(() => warehouses.id, { onDelete: 'restrict' }),
  // The source import (file + mapping trail). v1 always set — every document
  // is born by approving an import; nullable reserved for a future fileless
  // manual path.
  importId: uuid('import_id').references(() => replenishmentImports.id, {
    onDelete: 'restrict',
  }),
  // Copied from the import's staged prep at approval; permanent
  // `manttio-wms-evidence` bucket keys.
  evidencePhotos: text('evidence_photos').array().notNull().default(sql`'{}'::text[]`),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Document lines. Processable rows also emit inbound movements + stock in the
// approval transaction; serial-collision rows (00 §6 #15) promote as VISIBLE
// but UNPROCESSED items — `unprocessable: true` + the ParseRowError code, no
// movement, no units, no stock effect — an awareness artifact for record
// review / provider follow-up.
export const replenishmentItems = pgTable(
  'replenishment_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    replenishmentId: uuid('replenishment_id')
      .notNull()
      .references(() => replenishments.id, { onDelete: 'restrict' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    // Unserialized + lot lines.
    quantity: numeric('quantity', { precision: 12, scale: 3 }),
    // Package count for lot lines (user 2026-08-08).
    pieces: integer('pieces'),
    // Serialized lines — the units themselves land in `material_units` at
    // approval.
    serials: text('serials').array(),
    // Lot lines: lot number (+ optional expiry); approval upserts
    // `material_lots` (top-up when it exists).
    lot: text('lot'),
    lotExpiresAt: timestamp('lot_expires_at', { withTimezone: true }),
    storageNodeId: uuid('storage_node_id').references(() => storageNodes.id, {
      onDelete: 'restrict',
    }),
    unprocessable: boolean('unprocessable').notNull().default(false),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('replenishment_items_replenishment_idx').on(table.replenishmentId)],
);

// Module-local counter twin of `report_counters` (00 §6 #7): row
// 'replenishment_folio', incremented inside the confirm transaction. Not an
// entity — no soft-delete columns, nothing ever removes a row.
export const wmsCounters = pgTable('wms_counters', {
  id: text('id').primaryKey(),
  value: integer('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
