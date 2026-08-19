import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { reports } from '../../reports/models/reports.model';
import { users } from '../../users/models/users.model';
import { MovementType, ReadjustmentDirection } from '../enums/movements.enum';
import { materialUnits } from './material-units.model';
import { materials } from './materials.model';
import { movementReasonDefs } from './movement-reason-defs.model';
import { replenishments } from './replenishments.model';
import { stockCountSessions } from './stock-count.model';
import { storageNodes } from './storage-nodes.model';
import { warehouses } from './warehouses.model';

// THE APPEND-ONLY JOURNAL (10-wms/01 §2; decided 2026-07-05, master plan §4):
// movements are created, NEVER mutated — no `updatedAt`, no `deletedAt`, and
// the repository exposes insert + reads ONLY (grep-provable, 01 CP-2). Every
// correction is a new `readjustment` movement. Balances
// (`stock_entries`/`material_lots`/unit status) are materialized in the same
// transaction (01 §3); the signed sum of this journal must always equal them.
//
// Deltas per type: inbound +to · transfer −from/+to · consumption −from ·
// readjustment ± per `direction`.
export const movements = pgTable(
  'movements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: text('type').$type<MovementType>().notNull(),
    // Readjustment only — enforced by the check below.
    direction: text('direction').$type<ReadjustmentDirection>(),
    // FK to `movement_reason_defs.code` (not the uuid) so history renders
    // without a join-for-identity; the backend validates type ↔ appliesTo on
    // every insert (`400 invalid_reason_context` / `400 reason_inactive`).
    reason: text('reason')
      .notNull()
      .references(() => movementReasonDefs.code, { onDelete: 'restrict' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'restrict' }),
    // Unserialized + lot movements; serialized movements use `movement_units`.
    // Whole integers in v1 (00 §6 #22).
    quantity: numeric('quantity', { precision: 12, scale: 3 }),
    // Lot movements: which lot the quantity moved in/out of, and how many
    // physical packages went with it (`pieces` — user 2026-08-08, journaled so
    // the pieces dimension reconciles like quantity does).
    lotNumber: text('lot_number'),
    pieces: integer('pieces'),
    // Set on transfer / consumption / readjustment-out.
    fromWarehouseId: uuid('from_warehouse_id').references(() => warehouses.id, {
      onDelete: 'restrict',
    }),
    fromNodeId: uuid('from_node_id').references(() => storageNodes.id, {
      onDelete: 'restrict',
    }),
    // Set on inbound / transfer / readjustment-in.
    toWarehouseId: uuid('to_warehouse_id').references(() => warehouses.id, {
      onDelete: 'restrict',
    }),
    toNodeId: uuid('to_node_id').references(() => storageNodes.id, {
      onDelete: 'restrict',
    }),
    // Consumption + report-material compensations (08 §3).
    reportId: text('report_id').references(() => reports.id, { onDelete: 'restrict' }),
    replenishmentId: uuid('replenishment_id').references(() => replenishments.id, {
      onDelete: 'restrict',
    }),
    // Set on the readjustments a count-apply emits (owner 2026-07-21, 00 §6
    // #29).
    countSessionId: uuid('count_session_id').references(() => stockCountSessions.id, {
      onDelete: 'restrict',
    }),
    // Who executed it.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Required (validator-level) when `type = 'readjustment'`, and whenever
    // the reason sets `requiresNote` (00 §6 #23).
    notes: text('notes'),
    // 00 §6 #21 (accepted 2026-07-20): client-generated `Idempotency-Key`
    // header on stock-mutating endpoints — a replay returns the original
    // movement, never a second one. Technicians run the offline PWA over
    // flaky field links; a retried self-checkout must not double a balance.
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // `direction` exactly when readjustment (01 §2).
    check(
      'movements_readjustment_direction_check',
      sql`(${table.type} = 'readjustment') = (${table.direction} is not null)`,
    ),
    uniqueIndex('movements_idempotency_key_uidx')
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    // The journal reads: per-material history, per-location history, and the
    // document/report/count backlinks.
    index('movements_material_idx').on(table.materialId, table.createdAt),
    index('movements_from_idx').on(table.fromWarehouseId, table.createdAt),
    index('movements_to_idx').on(table.toWarehouseId, table.createdAt),
    index('movements_report_idx')
      .on(table.reportId)
      .where(sql`${table.reportId} is not null`),
    index('movements_replenishment_idx')
      .on(table.replenishmentId)
      .where(sql`${table.replenishmentId} is not null`),
    index('movements_count_session_idx')
      .on(table.countSessionId)
      .where(sql`${table.countSessionId} is not null`),
  ],
);

// Serialized movement detail (00 §6 #2): a JOIN TABLE instead of an id array —
// FK integrity, and "history of this unit" is a plain indexed join (the
// material-view unit drill-down, the equipment hook in 11-equipment §1).
// Append-only with its parent.
export const movementUnits = pgTable(
  'movement_units',
  {
    movementId: uuid('movement_id')
      .notNull()
      .references(() => movements.id, { onDelete: 'restrict' }),
    materialUnitId: uuid('material_unit_id')
      .notNull()
      .references(() => materialUnits.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.movementId, table.materialUnitId] }),
    index('movement_units_unit_idx').on(table.materialUnitId),
  ],
);
