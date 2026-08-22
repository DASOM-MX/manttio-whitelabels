import { and, asc, eq, gt } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { MaterialUnitStatus } from '../enums/materials.enum';
import { materialLots } from '../models/material-lots.model';
import { materials } from '../models/materials.model';
import { materialUnits } from '../models/material-units.model';
import { stockEntries } from '../models/stock-entries.model';
import { storageNodes } from '../models/storage-nodes.model';

// What's on hand at a warehouse (02 §2, `GET /warehouses/:id/stock`). Reads
// only — every write to these tables goes through the stock operations
// transaction (01 §3), which is the stock submodule's.
//
// `nodeId` scopes to THAT location, not its subtree: the panel these feed shows
// what sits at the selected node (04 §2), and rolling children up would make a
// rack's total disagree with the sum of its sections on screen. Absent, the
// read covers the whole warehouse at any depth.
//
// The material join is deliberately NOT filtered on `deleted_at`: a material
// can only be soft-deleted at zero stock everywhere (01 §2), so a row here
// naming a dead material means the invariant broke — and hiding it would hide
// stock that physically exists.

const materialRef = {
  id: materials.id,
  name: materials.name,
  sku: materials.sku,
  unit: materials.unit,
  tracking: materials.tracking,
};

const nodeRef = {
  id: storageNodes.id,
  name: storageNodes.name,
  type: storageNodes.type,
};

/** Unserialized balances. Zero rows are excluded — a drained location keeps its
 *  row on purpose (01 §2) and listing it would read as "we have none of this
 *  here", which is a different statement from not stocking it at all. */
export const listStockEntriesAt = async (db: Db, warehouseId: string, nodeId?: string) =>
  db
    .select({ material: materialRef, node: nodeRef, quantity: stockEntries.quantity })
    .from(stockEntries)
    .innerJoin(materials, eq(materials.id, stockEntries.materialId))
    .leftJoin(storageNodes, eq(storageNodes.id, stockEntries.storageNodeId))
    .where(
      and(
        eq(stockEntries.warehouseId, warehouseId),
        nodeId ? eq(stockEntries.storageNodeId, nodeId) : undefined,
        gt(stockEntries.quantity, '0'),
      ),
    )
    .orderBy(asc(materials.name));

/** Serialized pieces, `in_stock` only (02 §2). Assigned, consumed and lost
 *  units keep their last location as history (01 §4) but are not on hand. */
export const listStockUnitsAt = async (db: Db, warehouseId: string, nodeId?: string) =>
  db
    .select({
      id: materialUnits.id,
      serialNumber: materialUnits.serialNumber,
      status: materialUnits.status,
      material: materialRef,
      node: nodeRef,
    })
    .from(materialUnits)
    .innerJoin(materials, eq(materials.id, materialUnits.materialId))
    .leftJoin(storageNodes, eq(storageNodes.id, materialUnits.storageNodeId))
    .where(
      and(
        eq(materialUnits.warehouseId, warehouseId),
        nodeId ? eq(materialUnits.storageNodeId, nodeId) : undefined,
        eq(materialUnits.status, MaterialUnitStatus.InStock),
      ),
    )
    .orderBy(asc(materials.name), asc(materialUnits.serialNumber));

/** Lot balances. `quantity` is the content, `pieces` the physical packages —
 *  both travel together (01 §2). */
export const listStockLotsAt = async (db: Db, warehouseId: string, nodeId?: string) =>
  db
    .select({
      material: materialRef,
      node: nodeRef,
      lotNumber: materialLots.lotNumber,
      quantity: materialLots.quantity,
      pieces: materialLots.pieces,
      expiresAt: materialLots.expiresAt,
    })
    .from(materialLots)
    .innerJoin(materials, eq(materials.id, materialLots.materialId))
    .leftJoin(storageNodes, eq(storageNodes.id, materialLots.storageNodeId))
    .where(
      and(
        eq(materialLots.warehouseId, warehouseId),
        nodeId ? eq(materialLots.storageNodeId, nodeId) : undefined,
        gt(materialLots.quantity, '0'),
      ),
    )
    .orderBy(asc(materials.name), asc(materialLots.lotNumber));
