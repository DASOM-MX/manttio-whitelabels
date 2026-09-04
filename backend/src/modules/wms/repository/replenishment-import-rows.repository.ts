import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../database/client';
import { materials } from '../models/materials.model';
import { replenishmentImportRows } from '../models/replenishment-imports.model';
import { storageNodes } from '../models/storage-nodes.model';
import type { UpdateStagedRowFields } from '../types/replenishment-imports.types';

// The STAGING table (10-wms/01 §2). Everything here is scratch: parsed data
// waiting for a human to approve it, then promoted and thrown away.
//
// ⚠️ THIS FILE HOLDS THE MODULE'S ONLY HARD DELETE, and it is sanctioned by
// name in the model (01 §2, 00 §2): staged rows are ephemeral pipeline
// artifacts, not entities. The permanent record is the promoted document, its
// movements, the import header and the append-only event log — a removed row
// leaves a `row_removed` event carrying its full snapshot, so nothing is
// actually forgotten. Do not extend this exception to anything else.

/** `numeric(12,3)` reads back as `95.000`. Trimmed here for the reason every
 *  other WMS quantity is: v1 quantities are whole integers (00 §6 #22), and a
 *  review table showing `95.000` where the material list shows `95` is the
 *  inconsistency the rule exists to prevent. Applied on BOTH reads so the audit
 *  diff and the DTO agree with each other too. */
const trimmedQuantity = sql<string | null>`trim_scale(${replenishmentImportRows.quantity})`;

/** Spelled out rather than selecting the table, because `quantity` has to come
 *  back trimmed and the rest must not silently drift from the model. */
const stagedColumns = {
  id: replenishmentImportRows.id,
  importId: replenishmentImportRows.importId,
  line: replenishmentImportRows.line,
  raw: replenishmentImportRows.raw,
  materialId: replenishmentImportRows.materialId,
  quantity: trimmedQuantity,
  pieces: replenishmentImportRows.pieces,
  serial: replenishmentImportRows.serial,
  lot: replenishmentImportRows.lot,
  lotExpiresAt: replenishmentImportRows.lotExpiresAt,
  storageNodeId: replenishmentImportRows.storageNodeId,
  error: replenishmentImportRows.error,
  createdAt: replenishmentImportRows.createdAt,
};

const rowSelection = {
  row: stagedColumns,
  material: {
    id: materials.id,
    name: materials.name,
    sku: materials.sku,
    unit: materials.unit,
    tracking: materials.tracking,
  },
  node: { id: storageNodes.id, name: storageNodes.name },
};

export const listStagedRows = async (db: Db, importId: string) =>
  db
    .select(rowSelection)
    .from(replenishmentImportRows)
    // LEFT on both: an unresolved code is the `unknown_sku` case, and a target
    // node is something the reviewer opts into.
    .leftJoin(materials, eq(materials.id, replenishmentImportRows.materialId))
    .leftJoin(storageNodes, eq(storageNodes.id, replenishmentImportRows.storageNodeId))
    .where(eq(replenishmentImportRows.importId, importId))
    .orderBy(asc(replenishmentImportRows.line));

export const findStagedRow = async (db: DbOrTx, importId: string, line: number) => {
  const [row] = await db
    .select(stagedColumns)
    .from(replenishmentImportRows)
    .where(
      and(
        eq(replenishmentImportRows.importId, importId),
        eq(replenishmentImportRows.line, line),
      ),
    )
    .limit(1);
  return row ?? null;
};

/** Does another line of the SAME import already carry this serial? The
 *  in-file duplicate rule is "first occurrence wins", so the lowest line keeps
 *  it — which is why this compares by line, not just by existence. */
export const serialTakenByEarlierLine = async (
  db: DbOrTx,
  importId: string,
  serial: string,
  line: number,
): Promise<boolean> => {
  const rows = await db
    .select({ line: replenishmentImportRows.line })
    .from(replenishmentImportRows)
    .where(
      and(
        eq(replenishmentImportRows.importId, importId),
        eq(replenishmentImportRows.serial, serial),
        ne(replenishmentImportRows.line, line),
        sql`${replenishmentImportRows.line} < ${line}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
};

export const updateStagedRow = async (
  tx: DbOrTx,
  id: string,
  fields: UpdateStagedRowFields,
) => {
  const [row] = await tx
    .update(replenishmentImportRows)
    .set(fields)
    .where(eq(replenishmentImportRows.id, id))
    .returning();
  return row ?? null;
};

/** The sanctioned hard delete — see the file header. Always paired with a
 *  `row_removed` event in the same transaction. */
export const deleteStagedRow = async (tx: DbOrTx, id: string) => {
  await tx.delete(replenishmentImportRows).where(eq(replenishmentImportRows.id, id));
};

/** Owner-cancel truncates the staging (02 §6) — the record closes, the event
 *  log keeps the story. */
export const deleteStagedRowsOfImport = async (tx: DbOrTx, importId: string) => {
  await tx.delete(replenishmentImportRows).where(eq(replenishmentImportRows.importId, importId));
};
