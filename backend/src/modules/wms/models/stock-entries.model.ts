import { sql } from 'drizzle-orm';
import { check, index, numeric, pgTable, unique, uuid } from 'drizzle-orm/pg-core';
import { materials } from './materials.model';
import { storageNodes } from './storage-nodes.model';
import { warehouses } from './warehouses.model';

// Unserialized balances, MATERIALIZED (10-wms/01 §2/§3, 00 §6 #1): updated in
// the same transaction as the movement insert — movements are the immutable
// journal, this is the fast current-state read. The reconciliation invariant
// (01 CP-2): for every (material, warehouse, node) the signed sum of movement
// quantities equals this row's `quantity`.
export const stockEntries = pgTable(
  'stock_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    storageNodeId: uuid('storage_node_id').references(() => storageNodes.id, {
      onDelete: 'restrict',
    }),
    // Whole integers in v1 (00 §6 #22), held in numeric.
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  },
  (table) => [
    // The upsert key for stock math (01 §3): NULLS NOT DISTINCT so
    // warehouse-level rows (NULL node) conflict properly.
    unique('stock_entries_material_location_uq')
      .on(table.materialId, table.warehouseId, table.storageNodeId)
      .nullsNotDistinct(),
    // Backstops races behind the `SELECT … FOR UPDATE` decrement path
    // (`409 insufficient_stock`).
    check('stock_entries_quantity_nonneg_check', sql`${table.quantity} >= 0`),
    index('stock_entries_location_idx').on(table.warehouseId, table.storageNodeId),
  ],
);
