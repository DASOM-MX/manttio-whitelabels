import { and, eq, inArray, lt } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../database/client';
import { ReplenishmentImportStatus } from '../enums/replenishment-imports.enum';
import { replenishmentImports } from '../models/replenishment-imports.model';
import { warehouses } from '../models/warehouses.model';
import type {
  NewReplenishmentImport,
  ReplenishmentImportRow,
} from '../types/replenishment-imports.types';

// The import HEADER — the status truth the frontend listens to (10-wms/02 §6).
// Never deleted: an abandoned import becomes `stale`, an owner-cancelled one
// `cancelled`, and the row outlives its staged data so the submission snapshot
// and the event log survive approval.

/** The states that hold the one-per-parent-warehouse slot (01 §2). `rejected`
 *  counts: its staging is intact and office is still working it. */
export const IN_FLIGHT_STATUSES: ReplenishmentImportStatus[] = [
  ReplenishmentImportStatus.Uploaded,
  ReplenishmentImportStatus.Queued,
  ReplenishmentImportStatus.Processing,
  ReplenishmentImportStatus.Ready,
  ReplenishmentImportStatus.Rejected,
];

const importSelection = {
  import: replenishmentImports,
  warehouseName: warehouses.name,
};

export const findImportById = async (db: DbOrTx, id: string) => {
  const [row] = await db
    .select(importSelection)
    .from(replenishmentImports)
    .innerJoin(warehouses, eq(warehouses.id, replenishmentImports.warehouseId))
    .where(eq(replenishmentImports.id, id))
    .limit(1);
  return row ?? null;
};

/** Which import currently holds the parent warehouse's slot. Read only to tell
 *  the client WHICH one to resume — the refusal itself comes from the partial
 *  unique index, so two simultaneous uploads cannot both pass a lookup. */
export const findInFlightImport = async (db: Db, parentWarehouseId: string) => {
  const [row] = await db
    .select({ id: replenishmentImports.id })
    .from(replenishmentImports)
    .where(
      and(
        eq(replenishmentImports.parentWarehouseId, parentWarehouseId),
        inArray(replenishmentImports.status, IN_FLIGHT_STATUSES),
      ),
    )
    .limit(1);
  return row ?? null;
};

export const insertImport = async (db: Db, values: NewReplenishmentImport) => {
  const [row] = await db.insert(replenishmentImports).values(values).returning();
  if (!row) throw new Error('insertImport returned no row');
  return row;
};

/** Every write bumps `updatedAt` — the SSE watcher and the pending strip both
 *  read freshness off it. */
export const updateImportRow = async (
  db: DbOrTx,
  id: string,
  fields: Partial<ReplenishmentImportRow>,
) => {
  const [row] = await db
    .update(replenishmentImports)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(replenishmentImports.id, id))
    .returning();
  return row ?? null;
};

/** Imports the retention sweep is allowed to clean up after (11 §4): the two
 *  states that hold leftovers nobody will come back for. `confirmed` had its
 *  rows deleted at approval and `cancelled` truncates its own in the cancel
 *  transaction, so neither ever appears here. */
export const listSweepableImports = async (db: Db, olderThan: Date) =>
  db
    .select({
      id: replenishmentImports.id,
      fileKey: replenishmentImports.fileKey,
      fileDeletedAt: replenishmentImports.fileDeletedAt,
    })
    .from(replenishmentImports)
    .where(
      and(
        inArray(replenishmentImports.status, [
          ReplenishmentImportStatus.Stale,
          ReplenishmentImportStatus.Failed,
        ]),
        lt(replenishmentImports.updatedAt, olderThan),
      ),
    );
