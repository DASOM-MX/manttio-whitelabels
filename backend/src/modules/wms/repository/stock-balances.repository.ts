import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Db, Tx } from '../../database/client';
import { MaterialUnitStatus } from '../enums/materials.enum';
import { materialLots } from '../models/material-lots.model';
import { materialUnits } from '../models/material-units.model';
import { stockEntries } from '../models/stock-entries.model';
import type { StockLocation } from '../types/stock.types';

// The MATERIALIZED side of stock math (10-wms/01 §3). Every function here runs
// inside the operation transaction that also inserts the movement — the
// journal and the balance are written together or not at all.
//
// Increments upsert. Decrements lock the row with `SELECT … FOR UPDATE` first,
// so two concurrent draws on the same balance serialize instead of both
// reading the same "enough" and both succeeding; the `CHECK (quantity >= 0)`
// on both tables backstops anything that still slips through.
//
// The arithmetic is written with the column name spelled OUT rather than
// interpolated. Drizzle renders a column reference unqualified when a
// statement has a single table, and an unqualified name inside an
// `ON CONFLICT DO UPDATE` is a different thing from the same name in a plain
// `SET` — spelling it removes the question. The `::numeric` / `::int` casts are
// load-bearing too: quantities travel as strings (a JSON float cannot hold
// `numeric(12,3)` exactly), and Postgres has no `numeric + text`.

/** A node-scoped location matcher. `eq(col, null)` matches nothing in SQL, so
 *  warehouse-level rows have to be found with `IS NULL` explicitly. */
const atNode = (column: PgColumn, storageNodeId: string | null) =>
  storageNodeId === null ? isNull(column) : eq(column, storageNodeId);

export const lockStockEntry = async (tx: Tx, materialId: string, at: StockLocation) => {
  const [row] = await tx
    .select()
    .from(stockEntries)
    .where(
      and(
        eq(stockEntries.materialId, materialId),
        eq(stockEntries.warehouseId, at.warehouseId),
        atNode(stockEntries.storageNodeId, at.storageNodeId),
      ),
    )
    .limit(1)
    .for('update');
  return row ?? null;
};

/** Destination side: create the balance row or add to it. */
export const addStockEntry = async (
  tx: Tx,
  materialId: string,
  at: StockLocation,
  quantity: string,
) => {
  await tx
    .insert(stockEntries)
    .values({
      materialId,
      warehouseId: at.warehouseId,
      storageNodeId: at.storageNodeId,
      quantity,
    })
    .onConflictDoUpdate({
      target: [stockEntries.materialId, stockEntries.warehouseId, stockEntries.storageNodeId],
      set: { quantity: sql`"stock_entries"."quantity" + ${quantity}::numeric` },
    });
};

/** Source side, on a row already locked by `lockStockEntry`. */
export const subtractStockEntry = async (tx: Tx, entryId: string, quantity: string) => {
  await tx
    .update(stockEntries)
    .set({ quantity: sql`"stock_entries"."quantity" - ${quantity}::numeric` })
    .where(eq(stockEntries.id, entryId));
};

export const lockLot = async (
  tx: Tx,
  materialId: string,
  lotNumber: string,
  at: StockLocation,
) => {
  const [row] = await tx
    .select()
    .from(materialLots)
    .where(
      and(
        eq(materialLots.materialId, materialId),
        eq(materialLots.lotNumber, lotNumber),
        eq(materialLots.warehouseId, at.warehouseId),
        atNode(materialLots.storageNodeId, at.storageNodeId),
      ),
    )
    .limit(1)
    .for('update');
  return row ?? null;
};

/** The expiry is a property of the LOT NUMBER, denormalized per location row
 *  (01 §2): a new location for a known lot reuses whatever date the lot already
 *  carries, so a split lot never disagrees with itself. */
export const findLotExpiry = async (tx: Tx, materialId: string, lotNumber: string) => {
  const [row] = await tx
    .select({ expiresAt: materialLots.expiresAt })
    .from(materialLots)
    .where(
      and(
        eq(materialLots.materialId, materialId),
        eq(materialLots.lotNumber, lotNumber),
        isNotNull(materialLots.expiresAt),
      ),
    )
    .limit(1);
  return row?.expiresAt ?? null;
};

/** Destination side. A repeat lot number is a TOP-UP, not an error (01 §2):
 *  `expires_at` is only written on first receipt — `coalesce` keeps the stored
 *  date when the row already has one. */
export const addLot = async (
  tx: Tx,
  values: {
    materialId: string;
    lotNumber: string;
    at: StockLocation;
    quantity: string;
    pieces: number;
    expiresAt: Date | null;
  },
) => {
  await tx
    .insert(materialLots)
    .values({
      materialId: values.materialId,
      lotNumber: values.lotNumber,
      warehouseId: values.at.warehouseId,
      storageNodeId: values.at.storageNodeId,
      quantity: values.quantity,
      pieces: values.pieces,
      expiresAt: values.expiresAt,
    })
    .onConflictDoUpdate({
      target: [
        materialLots.materialId,
        materialLots.lotNumber,
        materialLots.warehouseId,
        materialLots.storageNodeId,
      ],
      set: {
        quantity: sql`"material_lots"."quantity" + ${values.quantity}::numeric`,
        pieces: sql`"material_lots"."pieces" + ${values.pieces}::int`,
        expiresAt: sql`coalesce("material_lots"."expires_at", excluded."expires_at")`,
      },
    });
};

/** Source side, on a row already locked by `lockLot`. Both dimensions move. */
export const subtractLot = async (tx: Tx, lotId: string, quantity: string, pieces: number) => {
  await tx
    .update(materialLots)
    .set({
      quantity: sql`"material_lots"."quantity" - ${quantity}::numeric`,
      pieces: sql`"material_lots"."pieces" - ${pieces}::int`,
    })
    .where(eq(materialLots.id, lotId));
};

/** Serials already claimed for this material. Not partial on anything: a unit
 *  is never deleted, so a consumed serial stays claimed forever (01 §2). */
export const findExistingSerials = async (db: Db | Tx, materialId: string, serials: string[]) => {
  const rows = await db
    .select({ serialNumber: materialUnits.serialNumber })
    .from(materialUnits)
    .where(
      and(eq(materialUnits.materialId, materialId), inArray(materialUnits.serialNumber, serials)),
    );
  return rows.map((r) => r.serialNumber);
};

export const insertMaterialUnits = async (
  tx: Tx,
  materialId: string,
  at: StockLocation,
  serials: string[],
) =>
  tx
    .insert(materialUnits)
    .values(
      serials.map((serialNumber) => ({
        materialId,
        serialNumber,
        warehouseId: at.warehouseId,
        storageNodeId: at.storageNodeId,
        status: MaterialUnitStatus.InStock,
      })),
    )
    .returning();

/** Locked before any status flip so two callers cannot move the same piece. */
export const lockUnits = async (tx: Tx, materialId: string, unitIds: string[]) =>
  tx
    .select()
    .from(materialUnits)
    .where(and(eq(materialUnits.materialId, materialId), inArray(materialUnits.id, unitIds)))
    .for('update');

/** A move, a write-off and a restore are all the same write: new location, new
 *  status. Consumption and loss KEEP the last location on purpose (01 §4) —
 *  callers pass the location the unit already had. */
export const setUnitsState = async (
  tx: Tx,
  unitIds: string[],
  at: StockLocation,
  status: MaterialUnitStatus,
) =>
  tx
    .update(materialUnits)
    .set({ warehouseId: at.warehouseId, storageNodeId: at.storageNodeId, status })
    .where(inArray(materialUnits.id, unitIds))
    .returning({ id: materialUnits.id, serialNumber: materialUnits.serialNumber });
