import { and, count, desc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db, Tx } from '../../database/client';
import { users } from '../../users/models/users.model';
import { materials } from '../models/materials.model';
import { materialUnits } from '../models/material-units.model';
import { movementReasonDefs } from '../models/movement-reason-defs.model';
import { movements, movementUnits } from '../models/movements.model';
import { storageNodes } from '../models/storage-nodes.model';
import { warehouses } from '../models/warehouses.model';
import type { MovementFilters, NewMovement } from '../types/stock.types';

// THE APPEND-ONLY JOURNAL (10-wms/01 §2, CP-2). This file exposes INSERT and
// SELECT and nothing else — no update, no delete, grep-provable. Every
// correction is a new `readjustment` row, which is why the module can promise
// that history is what actually happened.

export const insertMovement = async (tx: Tx, values: NewMovement) => {
  const [row] = await tx.insert(movements).values(values).returning();
  if (!row) throw new Error('insert movements returned no row');
  return row;
};

/** Serialized detail (01 §2) — a join table, not an id array, so "history of
 *  this unit" stays a plain indexed join. */
export const insertMovementUnits = async (tx: Tx, movementId: string, unitIds: string[]) => {
  if (unitIds.length === 0) return;
  await tx
    .insert(movementUnits)
    .values(unitIds.map((materialUnitId) => ({ movementId, materialUnitId })));
};

/** 00 §6 #21: a replayed `Idempotency-Key` returns the ORIGINAL movement rather
 *  than booking a second one. Technicians run the offline PWA over flaky field
 *  links, and a retried self-checkout must not double a balance. */
export const findMovementIdByIdempotencyKey = async (db: Db, key: string) => {
  const [row] = await db
    .select({ id: movements.id })
    .from(movements)
    .where(eq(movements.idempotencyKey, key))
    .limit(1);
  return row?.id ?? null;
};

const fromWarehouse = alias(warehouses, 'from_warehouse');
const toWarehouse = alias(warehouses, 'to_warehouse');
const fromNode = alias(storageNodes, 'from_node');
const toNode = alias(storageNodes, 'to_node');

/** `numeric(12,3)` reads back as `7.000`; the whole module answers quantities
 *  as plain integers (00 §6 #22). NULL survives the trim as NULL — serialized
 *  movements carry no quantity at all. */
const trimmedQuantity = sql<string | null>`trim_scale(${movements.quantity})`;

const movementSelection = {
  id: movements.id,
  type: movements.type,
  direction: movements.direction,
  reasonCode: movements.reason,
  reasonLabel: movementReasonDefs.label,
  quantity: trimmedQuantity,
  pieces: movements.pieces,
  lotNumber: movements.lotNumber,
  reportId: movements.reportId,
  replenishmentId: movements.replenishmentId,
  countSessionId: movements.countSessionId,
  notes: movements.notes,
  createdAt: movements.createdAt,
  material: {
    id: materials.id,
    name: materials.name,
    sku: materials.sku,
    unit: materials.unit,
    tracking: materials.tracking,
  },
  user: { id: users.id, name: users.name },
  fromWarehouse: { id: fromWarehouse.id, name: fromWarehouse.name },
  toWarehouse: { id: toWarehouse.id, name: toWarehouse.name },
  fromNode: { id: fromNode.id, name: fromNode.name, type: fromNode.type },
  toNode: { id: toNode.id, name: toNode.name, type: toNode.type },
};

/** The reason join is INNER on `code` — `movements.reason` is a restrict-FK, so
 *  a row without a definition cannot exist. Everything else is LEFT: an inbound
 *  has no source, a warehouse-level movement has no node. */
const joinedMovements = (db: Db) =>
  db
    .select(movementSelection)
    .from(movements)
    .innerJoin(movementReasonDefs, eq(movementReasonDefs.code, movements.reason))
    .innerJoin(materials, eq(materials.id, movements.materialId))
    .innerJoin(users, eq(users.id, movements.userId))
    .leftJoin(fromWarehouse, eq(fromWarehouse.id, movements.fromWarehouseId))
    .leftJoin(toWarehouse, eq(toWarehouse.id, movements.toWarehouseId))
    .leftJoin(fromNode, eq(fromNode.id, movements.fromNodeId))
    .leftJoin(toNode, eq(toNode.id, movements.toNodeId));

export type JoinedMovementRow = Awaited<ReturnType<typeof joinedMovements>>[number];

/** A technician sees only movements that touched their own van or their own
 *  reports (02 §4). Written as an EXISTS rather than a join so a movement is
 *  never duplicated by the scope check.
 *
 *  `movements.report_id` is spelled out inside the subquery: drizzle renders a
 *  column reference unqualified when the outer statement has a single table,
 *  and `reports r` would then capture the bare name — the correlation would
 *  silently compare the inner row to itself and match nothing. */
const technicianScoped = (userId: string, warehouseId: string | null) => {
  const ownReports = sql`exists (
    select 1 from reports r
    where r.id = movements.report_id
      and (r.assigned_to = ${userId} or r.created_by = ${userId})
  )`;
  if (!warehouseId) return ownReports;
  return or(
    eq(movements.fromWarehouseId, warehouseId),
    eq(movements.toWarehouseId, warehouseId),
    ownReports,
  );
};

const whereFor = (filters: MovementFilters) =>
  and(
    filters.materialId ? eq(movements.materialId, filters.materialId) : undefined,
    // Either side — "everything that touched this warehouse" is one question.
    filters.warehouseId
      ? or(
          eq(movements.fromWarehouseId, filters.warehouseId),
          eq(movements.toWarehouseId, filters.warehouseId),
        )
      : undefined,
    filters.nodeId
      ? or(eq(movements.fromNodeId, filters.nodeId), eq(movements.toNodeId, filters.nodeId))
      : undefined,
    filters.reportId ? eq(movements.reportId, filters.reportId) : undefined,
    filters.replenishmentId
      ? eq(movements.replenishmentId, filters.replenishmentId)
      : undefined,
    filters.lotNumber ? eq(movements.lotNumber, filters.lotNumber) : undefined,
    filters.type ? eq(movements.type, filters.type) : undefined,
    filters.reason ? eq(movements.reason, filters.reason) : undefined,
    filters.from ? gte(movements.createdAt, filters.from) : undefined,
    filters.to ? lte(movements.createdAt, filters.to) : undefined,
    filters.technicianScope
      ? technicianScoped(
          filters.technicianScope.userId,
          filters.technicianScope.warehouseId,
        )
      : undefined,
  );

export const listMovementsPaged = async (
  db: Db,
  filters: MovementFilters,
  page: number,
  limit: number,
) => {
  const where = whereFor(filters);
  const [rows, [totals]] = await Promise.all([
    joinedMovements(db)
      .where(where)
      // `id` breaks ties: several movements of one operation share a timestamp
      // to the microsecond, and an unstable order would shuffle them between
      // pages.
      .orderBy(desc(movements.createdAt), desc(movements.id))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(movements).where(where),
  ]);
  return { rows, total: totals?.total ?? 0 };
};

export const findMovementById = async (db: Db, id: string) => {
  const [row] = await joinedMovements(db).where(eq(movements.id, id)).limit(1);
  return row ?? null;
};

/** Serialized detail for a page of movements, in one round trip. */
export const listUnitsForMovements = async (db: Db, movementIds: string[]) => {
  if (movementIds.length === 0) return [];
  return db
    .select({
      movementId: movementUnits.movementId,
      id: materialUnits.id,
      serialNumber: materialUnits.serialNumber,
    })
    .from(movementUnits)
    .innerJoin(materialUnits, eq(materialUnits.id, movementUnits.materialUnitId))
    .where(inArray(movementUnits.movementId, movementIds))
    .orderBy(materialUnits.serialNumber);
};
