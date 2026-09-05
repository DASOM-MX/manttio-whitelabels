import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { users } from '../../users/models/users.model';
import { MaterialUnitStatus } from '../enums/materials.enum';
import { materialLots } from '../models/material-lots.model';
import { materialUnits } from '../models/material-units.model';
import { stockEntries } from '../models/stock-entries.model';
import { storageNodes } from '../models/storage-nodes.model';
import type { NewStorageNode, UpdateStorageNodeFields } from '../types/warehouses.types';

const live = isNull(storageNodes.deletedAt);

/** What makes the frontend tree lazy (04 §2): the expand arrow is drawn from
 *  this flag, so a level nobody opened is never queried. A correlated EXISTS
 *  rather than a child join — one row per node either way, and no GROUP BY. */
const hasChildren = sql<boolean>`exists (
  select 1 from storage_nodes child
  where child.parent_node_id = ${storageNodes.id} and child.deleted_at is null
)`;

const nodeSelection = {
  node: storageNodes,
  assigneeName: users.name,
  hasChildren,
};

/** One level of the tree. Absent `parentNodeId` = the warehouse's roots — and
 *  a root may be any type (01 §2), so this never filters on type. */
export const listStorageNodes = async (db: Db, warehouseId: string, parentNodeId?: string) =>
  db
    .select(nodeSelection)
    .from(storageNodes)
    .leftJoin(users, eq(users.id, storageNodes.assignedUserId))
    .where(
      and(
        eq(storageNodes.warehouseId, warehouseId),
        parentNodeId
          ? eq(storageNodes.parentNodeId, parentNodeId)
          : isNull(storageNodes.parentNodeId),
        live,
      ),
    )
    .orderBy(asc(storageNodes.name));

export const findStorageNodeById = async (db: Db, id: string) => {
  const [row] = await db
    .select(nodeSelection)
    .from(storageNodes)
    .leftJoin(users, eq(users.id, storageNodes.assignedUserId))
    .where(and(eq(storageNodes.id, id), live))
    .limit(1);
  return row ?? null;
};

export const insertStorageNode = async (db: Db, values: NewStorageNode) => {
  const [row] = await db.insert(storageNodes).values(values).returning();
  if (!row) throw new Error('insertStorageNode returned no row');
  return row;
};

export const updateStorageNodeRow = async (
  db: Db,
  id: string,
  fields: UpdateStorageNodeFields,
) => {
  const [row] = await db
    .update(storageNodes)
    .set(fields)
    .where(and(eq(storageNodes.id, id), live))
    .returning();
  return row ?? null;
};

export const softDeleteStorageNode = async (db: Db, id: string) => {
  const [row] = await db
    .update(storageNodes)
    .set({ deletedAt: new Date() })
    .where(and(eq(storageNodes.id, id), live))
    .returning();
  return row ?? null;
};

export const hasLiveChildNodes = async (db: Db, id: string): Promise<boolean> => {
  const rows = await db
    .select({ id: storageNodes.id })
    .from(storageNodes)
    .where(and(eq(storageNodes.parentNodeId, id), live))
    .limit(1);
  return rows.length > 0;
};

/** Stock held AT this node, not in its subtree — a node with live children is
 *  already refused by the child check, so by the time this runs the node is a
 *  leaf and the two questions coincide. */
export const nodeHasStock = async (db: Db, id: string): Promise<boolean> => {
  const entries = await db
    .select({ id: stockEntries.id })
    .from(stockEntries)
    .where(and(eq(stockEntries.storageNodeId, id), gt(stockEntries.quantity, '0')))
    .limit(1);
  if (entries.length > 0) return true;

  const units = await db
    .select({ id: materialUnits.id })
    .from(materialUnits)
    .where(
      and(
        eq(materialUnits.storageNodeId, id),
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
    .where(and(eq(materialLots.storageNodeId, id), gt(materialLots.quantity, '0')))
    .limit(1);
  return lots.length > 0;
};
