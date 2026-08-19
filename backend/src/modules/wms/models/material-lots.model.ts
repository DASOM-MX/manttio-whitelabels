import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { materials } from './materials.model';
import { storageNodes } from './storage-nodes.model';
import { warehouses } from './warehouses.model';

// Lot balances per location (10-wms/01 §2, added 2026-07-20, owner) — batch
// consumables technicians draw QUANTITIES from. A row is one lot's balance at
// one location (a lot split across the shop and a van = two rows); lot
// identity is `(materialId, lotNumber)`.
//
// `pieces` + `quantity` (user decision 2026-08-08): 10 bags of 500 nails land
// as ONE row `{ pieces: 10, quantity: 5000 }` — `quantity` is the content
// (nails) and partially consumable, `pieces` counts the physical packages and
// moves only when whole packages arrive/transfer/write off. Both dimensions
// are journaled on the movement row.
//
// Re-receipt = TOP-UP (owner 2026-07-20): a repeat lot number — in-file or in
// DB — is NOT an error; it adds to the balance (upsert keyed on the unique
// below). Accepted trade-off: a typo'd lot silently merges into the wrong lot,
// same risk profile as any quantity entry; the movement history records it.
//
// NO `deletedAt`: a drained lot row keeps its zero balance so history reads
// naturally (drained-lot cleanup deliberately unasked until real data hoards
// rows).
export const materialLots = pgTable(
  'material_lots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    lotNumber: text('lot_number').notNull(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    storageNodeId: uuid('storage_node_id').references(() => storageNodes.id, {
      onDelete: 'restrict',
    }),
    // Content amount — whole integers in v1 (00 §6 #22), held in numeric.
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    // Physical package count at this location (user 2026-08-08).
    pieces: integer('pieces').notNull().default(0),
    // A property of the lot NUMBER, denormalized per location row (added
    // 2026-07-20, owner): first receipt sets it, top-up keeps it, transfer
    // inherits the source row's value, and a fresh location for a known
    // `(material, lotNumber)` reuses its stored expiry — the service keeps it
    // consistent. NULL = no expiry tracked (the common case).
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // The upsert key for stock math (01 §3): NULLS NOT DISTINCT so
    // warehouse-level rows (NULL node) conflict properly on top-up.
    unique('material_lots_lot_location_uq')
      .on(table.materialId, table.lotNumber, table.warehouseId, table.storageNodeId)
      .nullsNotDistinct(),
    // Backstops races behind the `SELECT … FOR UPDATE` decrement path
    // (`409 insufficient_stock`).
    check('material_lots_quantity_nonneg_check', sql`${table.quantity} >= 0`),
    check('material_lots_pieces_nonneg_check', sql`${table.pieces} >= 0`),
    index('material_lots_location_idx').on(table.warehouseId, table.storageNodeId),
  ],
);
