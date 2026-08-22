import { and, asc, eq, gt, ilike, isNull, or, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Db } from '../../database/client';
import { MaterialUnitStatus } from '../enums/materials.enum';
import type { MaterialTracking } from '../enums/materials.enum';
import { materialLots } from '../models/material-lots.model';
import { materials } from '../models/materials.model';
import { materialUnits } from '../models/material-units.model';
import { movements } from '../models/movements.model';
import { stockEntries } from '../models/stock-entries.model';
import { storageNodes } from '../models/storage-nodes.model';
import { warehouses } from '../models/warehouses.model';
import type { MaterialRow, NewMaterial, UpdateMaterialFields } from '../types/materials.types';

const live = isNull(materials.deletedAt);

/** `numeric(12,3)` reads back as `7.000`; v1 quantities are whole integers
 *  (00 §6 #22) and the column's scale is an implementation detail the API has
 *  no reason to leak. Applied to every quantity this module returns so one
 *  endpoint never answers `7` where another answers `7.000`. */
const trimmed = (column: PgColumn) => sql<string>`trim_scale(${column})`;

/** On-hand total across the three stock tables, computed in SQL because the
 *  list both FILTERS and PAGES on it (`lowStock`) — a total folded in memory
 *  could only ever be applied to the page already fetched, which would page
 *  wrongly.
 *
 *  Summing all three is safe rather than sloppy: a material has exactly one
 *  tracking mode (01 §2), so two of these three subqueries are always empty.
 *  `trim_scale` keeps a whole five reading as `5` instead of `5.000` — v1
 *  quantities are whole integers (00 §6 #22) and the column's scale is an
 *  implementation detail the API shouldn't leak. */
// The outer column is written OUT, not interpolated. Drizzle renders
// `${materials.id}` unqualified as `"id"` when the query has a single table,
// and inside `from stock_entries se` the inner scope captures that name — the
// subquery silently becomes `se.material_id = se.id`, which is never true. It
// does not error; it just returns 0 forever. Qualify it by hand.
const totalStock = sql<string>`trim_scale(
  coalesce((select sum(se.quantity) from stock_entries se
             where se.material_id = materials.id), 0)
  + coalesce((select count(*) from material_units mu
               where mu.material_id = materials.id
                 and mu.status = ${MaterialUnitStatus.InStock}), 0)
  + coalesce((select sum(ml.quantity) from material_lots ml
               where ml.material_id = materials.id), 0)
)`;

/** A material with no threshold cannot be under it — `min_stock is not null`
 *  is part of the rule, not a guard against NULL comparison semantics. */
const belowMinimum = sql`${materials.minStock} is not null and (${totalStock}) < ${materials.minStock}`;

const materialSelection = { material: materials, totalStock };

/** Search resolves a **scanned barcode** as well as typed text (02 §3): a
 *  keyboard-wedge scanner types the digits and hits Enter, so an exact `upc`
 *  match is what makes the plain search box a scan target — no dedicated
 *  scanning UI needed. `sku` matches by prefix (codes are typed from the
 *  front), `name` anywhere. */
const matchesSearch = (search: string) =>
  or(
    ilike(materials.name, `%${search}%`),
    ilike(materials.sku, `${search}%`),
    eq(materials.upc, search),
  );

const listConditions = (filters: {
  search?: string;
  tracking?: MaterialTracking;
  lowStock?: boolean;
}) => {
  const conds = [live];
  if (filters.search) {
    const match = matchesSearch(filters.search);
    if (match) conds.push(match);
  }
  if (filters.tracking) conds.push(eq(materials.tracking, filters.tracking));
  if (filters.lowStock) conds.push(belowMinimum);
  return and(...conds);
};

export const listMaterialsPaged = async (
  db: Db,
  filters: { search?: string; tracking?: MaterialTracking; lowStock?: boolean },
  page: number,
  limit: number,
) => {
  const where = listConditions(filters);
  const [items, countRows] = await Promise.all([
    db
      .select(materialSelection)
      .from(materials)
      .where(where)
      .orderBy(asc(materials.name))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)::int` }).from(materials).where(where),
  ]);
  return { items, total: countRows[0]?.count ?? 0 };
};

export const findMaterialById = async (db: Db, id: string) => {
  const [row] = await db
    .select(materialSelection)
    .from(materials)
    .where(and(eq(materials.id, id), live))
    .limit(1);
  return row ?? null;
};

export const insertMaterial = async (db: Db, values: NewMaterial): Promise<MaterialRow> => {
  const [row] = await db.insert(materials).values(values).returning();
  if (!row) throw new Error('insertMaterial returned no row');
  return row;
};

export const updateMaterialRow = async (db: Db, id: string, fields: UpdateMaterialFields) => {
  const [row] = await db
    .update(materials)
    .set(fields)
    .where(and(eq(materials.id, id), live))
    .returning();
  return row ?? null;
};

export const softDeleteMaterial = async (db: Db, id: string) => {
  const [row] = await db
    .update(materials)
    .set({ deletedAt: new Date() })
    .where(and(eq(materials.id, id), live))
    .returning();
  return row ?? null;
};

/** One journal row is enough to freeze `tracking` (01 §2) — the balances those
 *  movements built live in the table the CURRENT mode names, and switching
 *  would strand them. Deliberately not "has stock": a material drained back to
 *  zero still has a history that assumes its mode. */
export const materialHasMovements = async (db: Db, id: string): Promise<boolean> => {
  const rows = await db
    .select({ id: movements.id })
    .from(movements)
    .where(eq(movements.materialId, id))
    .limit(1);
  return rows.length > 0;
};

/** Anywhere, in any mode. `assigned` units count as present — reserved, not
 *  gone — the same rule the warehouse emptiness check applies. */
export const materialHasStock = async (db: Db, id: string): Promise<boolean> => {
  const entries = await db
    .select({ id: stockEntries.id })
    .from(stockEntries)
    .where(and(eq(stockEntries.materialId, id), gt(stockEntries.quantity, '0')))
    .limit(1);
  if (entries.length > 0) return true;

  const units = await db
    .select({ id: materialUnits.id })
    .from(materialUnits)
    .where(
      and(
        eq(materialUnits.materialId, id),
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
    .where(and(eq(materialLots.materialId, id), gt(materialLots.quantity, '0')))
    .limit(1);
  return lots.length > 0;
};

// ── Per-location breakdown (`GET /materials/:id/stock`) ─────────────────────

const warehouseRef = { id: warehouses.id, name: warehouses.name };
const nodeRef = { id: storageNodes.id, name: storageNodes.name };

export const listMaterialEntries = async (db: Db, materialId: string) =>
  db
    .select({ warehouse: warehouseRef, node: nodeRef, quantity: trimmed(stockEntries.quantity) })
    .from(stockEntries)
    .innerJoin(warehouses, eq(warehouses.id, stockEntries.warehouseId))
    .leftJoin(storageNodes, eq(storageNodes.id, stockEntries.storageNodeId))
    .where(and(eq(stockEntries.materialId, materialId), gt(stockEntries.quantity, '0')))
    .orderBy(asc(warehouses.name));

/** Every status, not just `in_stock` (unlike the warehouse-scoped read): this
 *  is the "where did that serial end up?" surface, and a consumed or lost unit
 *  keeps its last location precisely so the question has an answer. */
export const listMaterialUnits = async (db: Db, materialId: string) =>
  db
    .select({
      id: materialUnits.id,
      serialNumber: materialUnits.serialNumber,
      status: materialUnits.status,
      warehouse: warehouseRef,
      node: nodeRef,
    })
    .from(materialUnits)
    .innerJoin(warehouses, eq(warehouses.id, materialUnits.warehouseId))
    .leftJoin(storageNodes, eq(storageNodes.id, materialUnits.storageNodeId))
    .where(eq(materialUnits.materialId, materialId))
    .orderBy(asc(materialUnits.serialNumber));

export const listMaterialLots = async (db: Db, materialId: string) =>
  db
    .select({
      lotNumber: materialLots.lotNumber,
      warehouse: warehouseRef,
      node: nodeRef,
      quantity: trimmed(materialLots.quantity),
      pieces: materialLots.pieces,
      expiresAt: materialLots.expiresAt,
    })
    .from(materialLots)
    .innerJoin(warehouses, eq(warehouses.id, materialLots.warehouseId))
    .leftJoin(storageNodes, eq(storageNodes.id, materialLots.storageNodeId))
    .where(and(eq(materialLots.materialId, materialId), gt(materialLots.quantity, '0')))
    .orderBy(asc(materialLots.lotNumber));
