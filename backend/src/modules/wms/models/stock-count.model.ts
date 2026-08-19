import { sql } from 'drizzle-orm';
import {
  boolean,
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
import { users } from '../../users/models/users.model';
import { StockCountStatus } from '../enums/stock-count.enum';
import { materials } from './materials.model';
import { storageNodes } from './storage-nodes.model';
import { warehouses } from './warehouses.model';

// Physical-count reconciliation (10-wms/01 §2, added 2026-07-21, owner, 00 §6
// #29). A session is a TIME WINDOW (`open → applied`), not a movement type:
// applying it emits one plain `readjustment` in/out per non-zero delta under
// the locked `stock_count` reason, bringing system stock to the count — the
// movement audit trail stays intact. Roles: office counts, ONLY owner/admin
// reviews + applies (the replenishment prep→approve split, 14 §2.1).
// APPEND-ONLY: no `deletedAt`, immutable after `applied`/`cancelled`; a
// re-count is a NEW session.
export const stockCountSessions = pgTable(
  'stock_count_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // The counted scope.
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'restrict' }),
    // Optional sub-scope (a single node).
    storageNodeId: uuid('storage_node_id').references(() => storageNodes.id, {
      onDelete: 'restrict',
    }),
    status: text('status')
      .$type<StockCountStatus>()
      .notNull()
      .default(StockCountStatus.Open),
    // SNAPSHOT of `wms.stock_count_blind` at OPEN — the session keeps the mode
    // it was opened under even if the setting changes (owner 2026-07-21:
    // blind = the counter doesn't see system quantities; default true).
    blind: boolean('blind').notNull(),
    openedBy: uuid('opened_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
    // Set when the reconciling readjustments are emitted (status → applied).
    appliedBy: uuid('applied_by').references(() => users.id, { onDelete: 'restrict' }),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    // Set on cancel (status → cancelled); no apply happened.
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    notes: text('notes'),
  },
  (table) => [
    check(
      'stock_count_sessions_status_check',
      sql`${table.status} in ('open', 'applied', 'cancelled')`,
    ),
    index('stock_count_sessions_warehouse_idx').on(table.warehouseId),
  ],
);

// One counted `(material, location, lot?)` cell. `delta = countedQty −
// systemQty` is DERIVED, never stored — it drives the emitted readjustment's
// direction on apply (+in / −out). Serialized counts reconcile the FOUND UNIT
// SET instead (units held but not found → readjustment-out to `lost`;
// unexpected found units are flagged, can't auto-add without a serial — the
// confirmed v1 workaround, owner 2026-07-21).
export const stockCountLines = pgTable(
  'stock_count_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    countSessionId: uuid('count_session_id')
      .notNull()
      .references(() => stockCountSessions.id, { onDelete: 'restrict' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    // The counted location.
    storageNodeId: uuid('storage_node_id').references(() => storageNodes.id, {
      onDelete: 'restrict',
    }),
    // Lot-tracked lines.
    lotNumber: text('lot_number'),
    // SNAPSHOTTED at open — the on-hand balance then. Whole integers in v1
    // (00 §6 #22).
    systemQty: numeric('system_qty', { precision: 12, scale: 3 }).notNull(),
    // NULL until the counter enters it.
    countedQty: numeric('counted_qty', { precision: 12, scale: 3 }),
    // The pieces dimension for lot lines (user 2026-08-08): package count
    // snapshotted/counted alongside the content quantity.
    systemPieces: integer('system_pieces'),
    countedPieces: integer('counted_pieces'),
  },
  (table) => [
    // One cell per session: NULLS NOT DISTINCT so warehouse-level (NULL node)
    // and lot-less lines dedupe properly.
    unique('stock_count_lines_cell_uq')
      .on(table.countSessionId, table.materialId, table.storageNodeId, table.lotNumber)
      .nullsNotDistinct(),
  ],
);
