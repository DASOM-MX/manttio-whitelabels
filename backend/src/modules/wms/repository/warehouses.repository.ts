import { and, asc, countDistinct, eq, gt, isNull, ne, or, sql, sum } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { users } from '../../users/models/users.model';
import { AssignmentRole } from '../enums/assignments.enum';
import { MaterialUnitStatus } from '../enums/materials.enum';
import { materialLots } from '../models/material-lots.model';
import { materialUnits } from '../models/material-units.model';
import { stockEntries } from '../models/stock-entries.model';
import { storageNodes } from '../models/storage-nodes.model';
import { warehouses } from '../models/warehouses.model';
import type {
  NewWarehouse,
  UpdateWarehouseFields,
  WarehouseStockSummaryDTO,
} from '../types/warehouses.types';

const live = isNull(warehouses.deletedAt);

/** Every read selects the warehouse row plus its assignee's name in one go —
 *  the registry always renders "who is responsible", so a second lookup per row
 *  would be a guaranteed N+1. */
const warehouseSelection = { warehouse: warehouses, assigneeName: users.name };

/** A technician may not see other technicians' vans (02 §2a) — that is their
 *  colleague's loaded stock, and it is also the source list for self-checkout,
 *  where drawing from someone else's van is forbidden outright.
 *
 *  Only the TECHNICIAN assignment hides a warehouse: one supervised by an admin
 *  is ordinary shared infrastructure. Rows with no assignee at all pass on the
 *  first branch, which is also what keeps the NULL `assignment_role` out of the
 *  `<>` comparison. */
const visibleToTechnician = (userId: string) =>
  or(
    isNull(warehouses.assignedUserId),
    ne(warehouses.assignmentRole, AssignmentRole.Technician),
    eq(warehouses.assignedUserId, userId),
  );

export const listWarehouses = async (
  db: Db,
  filters: { parentId?: string; visibleToTechnicianId?: string },
) => {
  const conds = [live];
  if (filters.parentId) conds.push(eq(warehouses.parentId, filters.parentId));
  if (filters.visibleToTechnicianId) {
    const scope = visibleToTechnician(filters.visibleToTechnicianId);
    if (scope) conds.push(scope);
  }
  return db
    .select(warehouseSelection)
    .from(warehouses)
    .leftJoin(users, eq(users.id, warehouses.assignedUserId))
    .where(and(...conds))
    .orderBy(asc(warehouses.name));
};

export const findWarehouseById = async (db: Db, id: string) => {
  const [row] = await db
    .select(warehouseSelection)
    .from(warehouses)
    .leftJoin(users, eq(users.id, warehouses.assignedUserId))
    .where(and(eq(warehouses.id, id), live))
    .limit(1);
  return row ?? null;
};

/** Per-warehouse stock summary for the registry tree, as three grouped queries
 *  merged in memory rather than one row per (warehouse, material).
 *
 *  Summing the three `count(distinct material_id)` is exact, not an
 *  approximation: a material has exactly ONE tracking mode (01 §2), so it can
 *  only ever appear in one of these three tables. Zero-balance rows are
 *  excluded — `stock_entries` and `material_lots` keep drained rows at zero on
 *  purpose, and counting them would show stock that isn't there. */
export const summarizeWarehouseStock = async (
  db: Db,
): Promise<Map<string, WarehouseStockSummaryDTO>> => {
  const [entryRows, unitRows, lotRows] = await Promise.all([
    db
      .select({
        warehouseId: stockEntries.warehouseId,
        materials: countDistinct(stockEntries.materialId),
        units: sum(stockEntries.quantity),
      })
      .from(stockEntries)
      .where(gt(stockEntries.quantity, '0'))
      .groupBy(stockEntries.warehouseId),
    db
      .select({
        warehouseId: materialUnits.warehouseId,
        materials: countDistinct(materialUnits.materialId),
        units: sql<string>`count(*)`,
      })
      .from(materialUnits)
      .where(eq(materialUnits.status, MaterialUnitStatus.InStock))
      .groupBy(materialUnits.warehouseId),
    db
      .select({
        warehouseId: materialLots.warehouseId,
        materials: countDistinct(materialLots.materialId),
        units: sum(materialLots.quantity),
      })
      .from(materialLots)
      .where(gt(materialLots.quantity, '0'))
      .groupBy(materialLots.warehouseId),
  ]);

  const summary = new Map<string, WarehouseStockSummaryDTO>();
  const fold = (rows: { warehouseId: string; materials: number; units: string | null }[]) => {
    for (const row of rows) {
      const current = summary.get(row.warehouseId) ?? { materialCount: 0, unitCount: 0 };
      current.materialCount += row.materials;
      current.unitCount += Number(row.units ?? 0);
      summary.set(row.warehouseId, current);
    }
  };
  fold(entryRows);
  fold(unitRows);
  fold(lotRows);
  return summary;
};

export const insertWarehouse = async (db: Db, values: NewWarehouse) => {
  const [row] = await db.insert(warehouses).values(values).returning();
  if (!row) throw new Error('insertWarehouse returned no row');
  return row;
};

export const updateWarehouseRow = async (db: Db, id: string, fields: UpdateWarehouseFields) => {
  const [row] = await db
    .update(warehouses)
    .set(fields)
    .where(and(eq(warehouses.id, id), live))
    .returning();
  return row ?? null;
};

/** Assignee and role move as one write — the DB check refuses them apart. */
export const setWarehouseAssignment = async (
  db: Db,
  id: string,
  assignment: { assignedUserId: string; assignmentRole: AssignmentRole } | null,
) => {
  const [row] = await db
    .update(warehouses)
    .set({
      assignedUserId: assignment?.assignedUserId ?? null,
      assignmentRole: assignment?.assignmentRole ?? null,
    })
    .where(and(eq(warehouses.id, id), live))
    .returning();
  return row ?? null;
};

/** Soft delete, and the warehouse's storage nodes go with it in the same
 *  transaction (01 §2) — a live node under a dead warehouse would be an
 *  orphaned location the tree could still reach. Movements keep pointing at
 *  both rows forever, which is exactly why neither is ever hard-deleted. */
export const softDeleteWarehouseWithNodes = async (db: Db, id: string) => {
  return db.transaction(async (tx) => {
    const deletedAt = new Date();
    await tx
      .update(storageNodes)
      .set({ deletedAt })
      .where(and(eq(storageNodes.warehouseId, id), isNull(storageNodes.deletedAt)));
    const [row] = await tx
      .update(warehouses)
      .set({ deletedAt })
      .where(and(eq(warehouses.id, id), live))
      .returning();
    return row ?? null;
  });
};

/** Existence, not a count — every caller only asks "is it childless?", and
 *  `LIMIT 1` says so honestly instead of returning a number capped at one. */
export const hasLiveChildWarehouses = async (db: Db, id: string): Promise<boolean> => {
  const rows = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(eq(warehouses.parentId, id), live))
    .limit(1);
  return rows.length > 0;
};

/** Empty means empty in all three tracking modes. Short-circuits on the first
 *  hit — this only runs on delete and re-parent, where being sure matters more
 *  than saving a round trip. `assigned` units count as present: they are
 *  reserved, not gone. */
export const warehouseHasStock = async (db: Db, id: string): Promise<boolean> => {
  const entries = await db
    .select({ id: stockEntries.id })
    .from(stockEntries)
    .where(and(eq(stockEntries.warehouseId, id), gt(stockEntries.quantity, '0')))
    .limit(1);
  if (entries.length > 0) return true;

  const units = await db
    .select({ id: materialUnits.id })
    .from(materialUnits)
    .where(
      and(
        eq(materialUnits.warehouseId, id),
        or(
          eq(materialUnits.status, MaterialUnitStatus.InStock),
          eq(materialUnits.status, MaterialUnitStatus.Assigned),
        ),
      ),
    )
    .limit(1);
  if (units.length > 0) return true;

  const lots = await db
    .select({ id: materialLots.id })
    .from(materialLots)
    .where(and(eq(materialLots.warehouseId, id), gt(materialLots.quantity, '0')))
    .limit(1);
  return lots.length > 0;
};

/** The van this technician already holds, if any — the one-active-van rule
 *  (01 §2). Scoped to the technician ASSIGNMENT ROLE on purpose: the same user
 *  may supervise any number of warehouses. */
export const findLiveTechnicianVan = async (
  db: Db,
  userId: string,
  exceptWarehouseId?: string,
) => {
  const conds = [
    live,
    eq(warehouses.assignedUserId, userId),
    eq(warehouses.assignmentRole, AssignmentRole.Technician),
  ];
  if (exceptWarehouseId) conds.push(ne(warehouses.id, exceptWarehouseId));
  const [row] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(...conds))
    .limit(1);
  return row ?? null;
};
