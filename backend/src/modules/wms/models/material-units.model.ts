import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { MaterialUnitStatus } from '../enums/materials.enum';
import { materials } from './materials.model';
import { storageNodes } from './storage-nodes.model';
import { warehouses } from './warehouses.model';

// SERIALIZED stock only — one row per physical piece with its own serial
// (10-wms/01 §2), created by inbound (ad-hoc or replenishment approval).
// Batch consumables (bags of nails/washers/zip ties) are NOT units: they live
// as per-lot balance rows in `material_lots` (pieces + quantity, partially
// consumable — user decision 2026-08-08). Only serialized materials are
// unique-identity stock.
//
// NO `deletedAt`: units are never deleted, `status` is the lifecycle
// (`in_stock → assigned → consumed`, or `→ lost` via a write-off
// readjustment). Consumption/loss keeps `warehouseId`/`storageNodeId` as the
// LAST location — no virtual "consumed" location, history reads naturally
// (01 §4).
//
// The reservation slice (00 §6 #10 — `reservedFor`, available-vs-on-hand,
// lot/unserialized holds) is DEFERRED (2026-08-08): its open mechanics are
// unsettled, and adding a nullable backlink later is purely additive. The
// `assigned` status value already ships with the enum.
export const materialUnits = pgTable(
  'material_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    serialNumber: text('serial_number').notNull(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    storageNodeId: uuid('storage_node_id').references(() => storageNodes.id, {
      onDelete: 'restrict',
    }),
    status: text('status')
      .$type<MaterialUnitStatus>()
      .notNull()
      .default(MaterialUnitStatus.InStock),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // `409 serial_exists` — per material, not global: two vendors may reuse a
    // serial across different products. Not partial: units never delete, so a
    // consumed unit's serial stays claimed forever (re-receipt of the same
    // serial is the `serial_exists` unprocessable-row case, 00 §6 #15).
    uniqueIndex('material_units_serial_uidx').on(table.materialId, table.serialNumber),
    // The two hot lookups: stock at a location, units of a material.
    index('material_units_location_idx').on(
      table.warehouseId,
      table.storageNodeId,
      table.status,
    ),
    index('material_units_material_idx').on(table.materialId, table.status),
  ],
);
