import type { AuthUser, Env } from '../../../env';
import type { Db, Tx } from '../../database/client';
import { isUniqueViolation } from '../../database/db-errors';
import { putObject, r2Key } from '../../storage/services/storage.service';
import { WMS_SETTING_KEYS } from '../constants/wms-setting-keys';
import { IMPORT_FILE_MAX_BYTES } from '../constants/import-limits';
import { MaterialTracking } from '../enums/materials.enum';
import {
  ImportEventType,
  ReplenishmentImportStatus,
  RowErrorCode,
} from '../enums/replenishment-imports.enum';
import { detectFields } from '../helpers/field-detection.helpers';
import {
  isUnprocessable,
  validateStagedRow,
} from '../helpers/import-rows.helpers';
import {
  FileTooLargeError,
  ImportInProgressError,
  ImportNotFoundError,
  ImportRowNotFoundError,
  ImportStateError,
  InvalidMappingError,
} from '../http-errors/replenishment-imports.error';
import { StorageNodeNotFoundError, NodeWarehouseMismatchError } from '../http-errors/warehouses.error';
import { findMaterialByCode, findMaterialById } from '../repository/materials.repository';
import {
  findImportById,
  findInFlightImport,
  insertImport,
  updateImportRow,
} from '../repository/replenishment-imports.repository';
import {
  deleteStagedRow,
  deleteStagedRowsOfImport,
  findStagedRow,
  listStagedRows,
  serialTakenByEarlierLine,
  updateStagedRow,
} from '../repository/replenishment-import-rows.repository';
import {
  findLatestRejectionComment,
  insertImportEvent,
  listImportEventsPaged,
} from '../repository/replenishment-import-events.repository';
import { findExistingSerials } from '../repository/stock-balances.repository';
import { findStorageNodeById } from '../repository/storage-nodes.repository';
import { getSetting, setSetting } from './wms-settings.service';
import { assertWarehouseAccess } from './warehouses.service';
import type {
  DetectedField,
  ImportEventDTO,
  ImportStagedRowDTO,
  ImportStatusDTO,
  ImportUploadDTO,
  LastReplenishmentMapping,
  ReplenishmentFieldMapping,
  ReplenishmentImportRow,
  UpdateImportFields,
  UpdateStagedRowFields,
} from '../types/replenishment-imports.types';
import type {
  AuditQuery,
  CancelImportInput,
  PrepImportInput,
  ProcessImportInput,
  RejectImportInput,
  RemoveStagedRowInput,
  UpdateStagedRowInput,
} from '../validators/replenishment-imports.validator';

// The import lifecycle (10-wms/02 §6): upload → map → queue → review → approve.
// This slice owns everything up to the queue hand-off and everything after the
// consumer stages its rows; the consumer itself (11) and the approval
// promotion land separately.
//
// EVERY mutating path emits its audit event IN THE SAME TRANSACTION as the
// change (01 §2). A state change that commits without its event would leave a
// timeline that quietly disagrees with the row it describes.

const opt = <T>(value: T | null): T | undefined => value ?? undefined;

/** Which states accept which move (02 §6). Spelled as data rather than as
 *  scattered `if`s because the state machine IS the endpoint contract, and the
 *  four `import_not_*` codes exist to say precisely which set was required. */
const PRE_APPROVAL: ReplenishmentImportStatus[] = [
  ReplenishmentImportStatus.Uploaded,
  ReplenishmentImportStatus.Queued,
  ReplenishmentImportStatus.Processing,
  ReplenishmentImportStatus.Ready,
  ReplenishmentImportStatus.Rejected,
];

/** Row edits, row removal and prep. `rejected` is editable on purpose — that is
 *  the whole point of sending it back with a comment. */
const EDITABLE: ReplenishmentImportStatus[] = [
  ReplenishmentImportStatus.Ready,
  ReplenishmentImportStatus.Rejected,
];

const loadImport = async (db: Db, importId: string) => {
  const row = await findImportById(db, importId);
  if (!row) throw new ImportNotFoundError(importId);
  return row;
};

const assertStatus = (
  row: ReplenishmentImportRow,
  allowed: ReplenishmentImportStatus[],
  code: 'import_not_pending' | 'import_not_ready' | 'import_not_rejected' | 'import_not_cancellable',
) => {
  if (!allowed.includes(row.status)) throw new ImportStateError(code, row.status);
};

// ── POST /replenishments/imports ───────────────────────────────────────────

/** Warehouse-first (owner 2026-07-21): the destination is chosen BEFORE the
 *  upload, so the import is warehouse-bound from creation and the
 *  one-in-flight slot is known immediately. */
export const uploadImport = async (
  db: Db,
  env: Env,
  user: AuthUser,
  input: { warehouseId: string; fileName: string; bytes: ArrayBuffer },
): Promise<ImportUploadDTO> => {
  if (input.bytes.byteLength > IMPORT_FILE_MAX_BYTES) {
    throw new FileTooLargeError(input.bytes.byteLength);
  }

  const warehouse = await assertWarehouseAccess(db, user, input.warehouseId);
  // Sub-warehouses and vans share their parent's slot; a root is its own parent.
  const parentWarehouseId = warehouse.parentId ?? warehouse.id;

  // Detected BEFORE the file is staged: an unreadable sheet must leave no row
  // and no orphan object behind (02 §6 — "no row created").
  const fields = detectFields(input.fileName, input.bytes);

  // ...then staged, because the reference is what the consumer pulls it by.
  const fileKey = r2Key(input.fileName, 'wms-imports');
  await putObject(env.MANTTIO_WMS_SHEETS, fileKey, input.bytes);

  let row: ReplenishmentImportRow;
  try {
    row = await insertImport(db, {
      fileKey,
      fileName: input.fileName,
      detectedFields: fields,
      warehouseId: input.warehouseId,
      parentWarehouseId,
      userId: user.id,
      status: ReplenishmentImportStatus.Uploaded,
    });
  } catch (err) {
    // The partial unique index is the arbiter, not a pre-check: two uploads
    // racing on the same parent would both pass a lookup and both insert.
    if (isUniqueViolation(err)) {
      const existing = await findInFlightImport(db, parentWarehouseId);
      // The orphan would otherwise sit in the transient bucket until the
      // retention sweep; there is no row that will ever reference it.
      await env.MANTTIO_WMS_SHEETS.delete(fileKey);
      throw new ImportInProgressError(existing?.id ?? null);
    }
    throw err;
  }

  await insertImportEvent(db, {
    importId: row.id,
    type: ImportEventType.Created,
    actorUserId: user.id,
    details: { fileName: input.fileName, warehouseId: input.warehouseId },
  });

  return {
    importId: row.id,
    fileName: row.fileName,
    fields,
    suggestedMapping: await suggestMapping(db, fields),
  };
};

/** The mapper-prefill memory is keyed by HEADER TEXT — field ids are per-import
 *  and mean nothing to the next upload (01 §2). A suggestion is offered only
 *  when the header set matches exactly; a partial match would prefill some
 *  columns and silently leave others wrong, which is worse than no prefill. */
const suggestMapping = async (
  db: Db,
  fields: DetectedField[],
): Promise<ReplenishmentFieldMapping | undefined> => {
  const remembered = await getSetting<LastReplenishmentMapping | null>(
    db,
    WMS_SETTING_KEYS.lastReplenishmentMapping,
    null,
  );
  if (!remembered) return undefined;

  const headers = fields.map((field) => field.header);
  const same =
    remembered.headers.length === headers.length &&
    remembered.headers.every((header, index) => headers[index] === header);
  if (!same) return undefined;

  const idFor = (header: string | undefined) =>
    header === undefined ? undefined : fields.find((f) => f.header === header)?.id;

  const sku = idFor(remembered.mapping.sku);
  if (!sku) return undefined;
  return {
    sku,
    quantity: idFor(remembered.mapping.quantity),
    pieces: idFor(remembered.mapping.pieces),
    serial: idFor(remembered.mapping.serial),
    lot: idFor(remembered.mapping.lot),
    expiry: idFor(remembered.mapping.expiry),
  };
};

// ── POST /replenishments/imports/:id/process ───────────────────────────────

export const processImport = async (
  db: Db,
  env: Env,
  user: AuthUser,
  importId: string,
  input: ProcessImportInput,
): Promise<{ status: ReplenishmentImportStatus }> => {
  const current = await loadImport(db, importId);
  assertStatus(current.import, [ReplenishmentImportStatus.Uploaded], 'import_not_pending');

  const fields = current.import.detectedFields;
  const known = new Set(fields.map((field) => field.id));
  for (const [target, id] of Object.entries(input.mapping)) {
    if (id !== undefined && !known.has(id)) {
      throw new InvalidMappingError(`${target} points at "${id}", which this file has no column for`);
    }
  }

  const headerOf = (id: string | undefined) =>
    id === undefined ? undefined : fields.find((field) => field.id === id)?.header;

  // Pretty-printed PLAIN TEXT, not jsonb (owner 2026-07-20): an exportable
  // artifact of exactly what was submitted and how it was mapped, formatting
  // included, that survives approval on the permanent header.
  const snapshot = JSON.stringify(
    {
      fileName: current.import.fileName,
      warehouse: { id: current.import.warehouseId, name: current.warehouseName },
      detectedFields: fields,
      mapping: input.mapping,
      submittedBy: user.id,
      submittedAt: new Date().toISOString(),
    },
    null,
    2,
  );

  await db.transaction(async (tx) => {
    await updateImportRow(tx, importId, {
      mapping: input.mapping,
      submissionSnapshot: snapshot,
      status: ReplenishmentImportStatus.Queued,
    });
    await insertImportEvent(tx, {
      importId,
      type: ImportEventType.MappingSubmitted,
      actorUserId: user.id,
      details: { warehouseId: current.import.warehouseId, mapping: input.mapping },
    });
  });

  // Remembered AFTER the commit and by header text, so the next upload of the
  // same report prefills its mapper (02 §6). Best-effort by nature: the
  // mapping is already stored on the import, and losing the convenience copy
  // must never fail a submission.
  await setSetting<LastReplenishmentMapping>(db, WMS_SETTING_KEYS.lastReplenishmentMapping, {
    headers: fields.map((field) => field.header),
    mapping: {
      sku: headerOf(input.mapping.sku) ?? '',
      quantity: headerOf(input.mapping.quantity),
      pieces: headerOf(input.mapping.pieces),
      serial: headerOf(input.mapping.serial),
      lot: headerOf(input.mapping.lot),
      expiry: headerOf(input.mapping.expiry),
    },
  });

  // The message carries the id only — file in R2, mapping in the DB (11 §1).
  await env.WMS_IMPORT_QUEUE.send({ importId });

  return { status: ReplenishmentImportStatus.Queued };
};

// ── GET /replenishments/imports/:id ────────────────────────────────────────

const toStagedRowDTO = (row: {
  row: Awaited<ReturnType<typeof listStagedRows>>[number]['row'];
  material: { id: string; name: string; sku: string | null; unit: string; tracking: string } | null;
  node: { id: string; name: string } | null;
}): ImportStagedRowDTO => ({
  line: row.row.line,
  raw: row.row.raw as Record<string, unknown>,
  material: row.material
    ? {
        id: row.material.id,
        name: row.material.name,
        sku: opt(row.material.sku),
        unit: row.material.unit,
        tracking: row.material.tracking,
      }
    : undefined,
  quantity: opt(row.row.quantity),
  pieces: opt(row.row.pieces),
  serial: opt(row.row.serial),
  lot: opt(row.row.lot),
  expiresAt: row.row.lotExpiresAt?.toISOString(),
  storageNode: row.node ?? undefined,
  error: (row.row.error as RowErrorCode | null) ?? undefined,
  unprocessable: isUnprocessable(row.row.error as RowErrorCode | null),
});

export const getImportStatus = async (
  db: Db,
  user: AuthUser,
  importId: string,
): Promise<ImportStatusDTO> => {
  const current = await loadImport(db, importId);
  await assertWarehouseAccess(db, user, current.import.warehouseId);

  // Rows exist only once the consumer has staged them; before that the client
  // is watching progress, not reviewing data.
  const staged = current.import.status === ReplenishmentImportStatus.Uploaded
    ? []
    : await listStagedRows(db, importId);

  return {
    id: current.import.id,
    status: current.import.status,
    fileName: current.import.fileName,
    warehouse: { id: current.import.warehouseId, name: current.warehouseName },
    fields: current.import.detectedFields,
    mapping: opt(current.import.mapping),
    submissionSnapshot: opt(current.import.submissionSnapshot),
    progress: {
      total: opt(current.import.totalRows),
      processed: current.import.processedRows,
      errors: current.import.errorRows,
    },
    error: opt(current.import.error),
    rejectionComment:
      current.import.status === ReplenishmentImportStatus.Rejected
        ? opt(await findLatestRejectionComment(db, importId))
        : undefined,
    evidencePhotos: current.import.evidencePhotos,
    notes: opt(current.import.notes),
    rows: staged.length > 0 ? staged.map(toStagedRowDTO) : undefined,
    createdAt: current.import.createdAt.toISOString(),
  };
};

// ── PATCH /replenishments/imports/:id/rows/:line ───────────────────────────

/** Re-resolve and re-validate the merged row through the SAME rules the parser
 *  used (02 §6). Returns the fields to write plus the audit diff. */
const mergeStagedRow = async (
  tx: Tx,
  importId: string,
  current: Awaited<ReturnType<typeof findStagedRow>> & object,
  input: UpdateStagedRowInput,
) => {
  const fields: UpdateStagedRowFields = {};
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const track = (key: string, from: unknown, to: unknown) => {
    if (from !== to) diff[key] = { from, to };
  };

  let materialId = current.materialId;
  if (input.code !== undefined) {
    const material = await findMaterialByCode(tx, input.code);
    materialId = material?.id ?? null;
    track('materialId', current.materialId, materialId);
    fields.materialId = materialId;
    // The raw record keeps what the reviewer actually typed, so the audit and
    // the display agree even when the code resolves to nothing.
    fields.raw = { ...(current.raw as Record<string, unknown>), code: input.code };
  }

  const quantity = input.quantity !== undefined ? (input.quantity === null ? null : String(input.quantity)) : current.quantity;
  if (input.quantity !== undefined) {
    track('quantity', current.quantity, quantity);
    fields.quantity = quantity;
  }
  const pieces = input.pieces !== undefined ? input.pieces : current.pieces;
  if (input.pieces !== undefined) {
    track('pieces', current.pieces, pieces);
    fields.pieces = pieces;
  }
  const serial = input.serial !== undefined ? input.serial : current.serial;
  if (input.serial !== undefined) {
    track('serial', current.serial, serial);
    fields.serial = serial;
  }
  const lot = input.lot !== undefined ? input.lot : current.lot;
  if (input.lot !== undefined) {
    track('lot', current.lot, lot);
    fields.lot = lot;
  }
  const expiresAt = input.expiresAt !== undefined ? input.expiresAt : current.lotExpiresAt;
  if (input.expiresAt !== undefined) {
    track('expiresAt', current.lotExpiresAt?.toISOString() ?? null, expiresAt?.toISOString() ?? null);
    fields.lotExpiresAt = expiresAt;
  }
  if (input.storageNodeId !== undefined) {
    track('storageNodeId', current.storageNodeId, input.storageNodeId);
    fields.storageNodeId = input.storageNodeId;
  }

  const material = materialId ? await findMaterialById(tx, materialId) : null;
  const tracking = (material?.material.tracking as MaterialTracking | undefined) ?? null;

  // Both serial checks are re-run against live state, not carried over: the
  // reviewer may have just changed the serial, and the DB may have gained one
  // since the parse.
  const serialDuplicateInFile =
    tracking === MaterialTracking.Serialized && serial !== null && serial !== ''
      ? await serialTakenByEarlierLine(tx, importId, serial, current.line)
      : false;
  const serialClaimedInDb =
    tracking === MaterialTracking.Serialized && materialId && serial
      ? (await findExistingSerials(tx, materialId, [serial])).length > 0
      : false;

  const error = validateStagedRow({
    tracking,
    quantity,
    serial,
    lot,
    // A bad date stays bad until something replaces it; editing the quantity
    // does not make it parseable.
    expiryUnresolved:
      current.error === RowErrorCode.BadExpiry && input.expiresAt === undefined,
    serialDuplicateInFile,
    serialClaimedInDb,
  });
  track('error', current.error, error);
  fields.error = error;

  return { fields, diff };
};

export const editStagedRow = async (
  db: Db,
  user: AuthUser,
  importId: string,
  line: number,
  input: UpdateStagedRowInput,
): Promise<ImportStagedRowDTO> => {
  const current = await loadImport(db, importId);
  await assertWarehouseAccess(db, user, current.import.warehouseId);
  assertStatus(current.import, EDITABLE, 'import_not_ready');

  if (input.storageNodeId !== undefined && input.storageNodeId !== null) {
    const node = await findStorageNodeById(db, input.storageNodeId);
    if (!node) throw new StorageNodeNotFoundError(input.storageNodeId);
    if (node.node.warehouseId !== current.import.warehouseId) {
      throw new NodeWarehouseMismatchError(input.storageNodeId, current.import.warehouseId);
    }
  }

  await db.transaction(async (tx) => {
    const row = await findStagedRow(tx, importId, line);
    if (!row) throw new ImportRowNotFoundError(line);

    const { fields, diff } = await mergeStagedRow(tx, importId, row, input);
    await updateStagedRow(tx, row.id, fields);
    await insertImportEvent(tx, {
      importId,
      type: ImportEventType.RowUpdated,
      actorUserId: user.id,
      line,
      details: diff,
    });
  });

  const staged = await listStagedRows(db, importId);
  const updated = staged.find((row) => row.row.line === line);
  if (!updated) throw new ImportRowNotFoundError(line);
  return toStagedRowDTO(updated);
};

// ── DELETE /replenishments/imports/:id/rows/:line ──────────────────────────

export const removeStagedRow = async (
  db: Db,
  user: AuthUser,
  importId: string,
  line: number,
  input: RemoveStagedRowInput,
): Promise<{ line: number; removed: true }> => {
  const current = await loadImport(db, importId);
  await assertWarehouseAccess(db, user, current.import.warehouseId);
  assertStatus(current.import, EDITABLE, 'import_not_ready');

  await db.transaction(async (tx) => {
    const row = await findStagedRow(tx, importId, line);
    if (!row) throw new ImportRowNotFoundError(line);

    // Event FIRST, carrying the whole row: the staged record is about to stop
    // existing, and the snapshot in the log is the only thing that will
    // remember what was taken out (02 §6).
    await insertImportEvent(tx, {
      importId,
      type: ImportEventType.RowRemoved,
      actorUserId: user.id,
      line,
      reason: input.reason,
      details: {
        raw: row.raw,
        materialId: row.materialId,
        quantity: row.quantity,
        serial: row.serial,
        lot: row.lot,
        error: row.error,
      },
    });
    await deleteStagedRow(tx, row.id);
  });

  return { line, removed: true };
};

// ── PATCH /replenishments/imports/:id (prep) ───────────────────────────────

export const prepImport = async (
  db: Db,
  user: AuthUser,
  importId: string,
  input: PrepImportInput,
): Promise<ImportStatusDTO> => {
  const current = await loadImport(db, importId);
  await assertWarehouseAccess(db, user, current.import.warehouseId);
  assertStatus(current.import, EDITABLE, 'import_not_ready');

  const fields: UpdateImportFields = {};
  if (input.evidencePhotos !== undefined) fields.evidencePhotos = input.evidencePhotos;
  if (input.notes !== undefined) fields.notes = input.notes;
  // Drizzle refuses an empty `.set({})`, and a prep form submitted unchanged is
  // a no-op rather than a 500.
  if (Object.keys(fields).length === 0) return getImportStatus(db, user, importId);

  await db.transaction(async (tx) => {
    await updateImportRow(tx, importId, fields);
    // One event PER CHANGED FIELD (02 §6) — "evidence added" and "notes
    // rewritten" are different things to review later.
    if (input.evidencePhotos !== undefined) {
      await insertImportEvent(tx, {
        importId,
        type: ImportEventType.EvidenceUpdated,
        actorUserId: user.id,
        details: { count: input.evidencePhotos.length },
      });
    }
    if (input.notes !== undefined) {
      await insertImportEvent(tx, {
        importId,
        type: ImportEventType.NotesUpdated,
        actorUserId: user.id,
        details: { cleared: input.notes === null },
      });
    }
  });

  return getImportStatus(db, user, importId);
};

// ── the decision endpoints ─────────────────────────────────────────────────

/** One shape for the four status moves: check the state, flip it, log it. They
 *  differ only in which states they accept and what they record. */
const transition = async (
  db: Db,
  user: AuthUser,
  importId: string,
  spec: {
    from: ReplenishmentImportStatus[];
    code: 'import_not_pending' | 'import_not_ready' | 'import_not_rejected' | 'import_not_cancellable';
    to: ReplenishmentImportStatus;
    event: ImportEventType;
    reason?: string;
    truncateStaging?: boolean;
    purgeFile?: (fileKey: string) => Promise<void>;
    fileDeleted?: boolean;
  },
): Promise<{ status: ReplenishmentImportStatus }> => {
  const current = await loadImport(db, importId);
  await assertWarehouseAccess(db, user, current.import.warehouseId);
  assertStatus(current.import, spec.from, spec.code);

  await db.transaction(async (tx) => {
    if (spec.truncateStaging) await deleteStagedRowsOfImport(tx, importId);
    await updateImportRow(tx, importId, {
      status: spec.to,
      ...(spec.fileDeleted ? { fileDeletedAt: new Date() } : {}),
    });
    await insertImportEvent(tx, {
      importId,
      type: spec.event,
      actorUserId: user.id,
      reason: spec.reason ?? null,
      details: {},
    });
  });

  // Outside the transaction on purpose: R2 has no rollback, so a purge that
  // ran and then lost its transaction would leave a row pointing at nothing.
  if (spec.purgeFile && current.import.fileDeletedAt === null) {
    await spec.purgeFile(current.import.fileKey);
  }

  return { status: spec.to };
};

/** Owner/admin send a `ready` import back with feedback; the staging is
 *  untouched so office can act on the comment and resubmit (02 §6). */
export const rejectImport = (db: Db, user: AuthUser, importId: string, input: RejectImportInput) =>
  transition(db, user, importId, {
    from: [ReplenishmentImportStatus.Ready],
    code: 'import_not_ready',
    to: ReplenishmentImportStatus.Rejected,
    event: ImportEventType.Rejected,
    reason: input.comment,
  });

export const resubmitImport = (db: Db, user: AuthUser, importId: string) =>
  transition(db, user, importId, {
    from: [ReplenishmentImportStatus.Rejected],
    code: 'import_not_rejected',
    to: ReplenishmentImportStatus.Ready,
    event: ImportEventType.Resubmitted,
  });

/** The benign abandon — no reason, cron-swept, any prep role. Distinct from
 *  cancel, which is immediate, reasoned and owner-only. */
export const discardImport = (db: Db, user: AuthUser, importId: string) =>
  transition(db, user, importId, {
    from: PRE_APPROVAL,
    code: 'import_not_cancellable',
    to: ReplenishmentImportStatus.Stale,
    event: ImportEventType.Stale,
  });

export const cancelImport = (
  db: Db,
  env: Env,
  user: AuthUser,
  importId: string,
  input: CancelImportInput,
) =>
  transition(db, user, importId, {
    from: PRE_APPROVAL,
    code: 'import_not_cancellable',
    to: ReplenishmentImportStatus.Cancelled,
    event: ImportEventType.Cancelled,
    reason: input.reason,
    truncateStaging: true,
    fileDeleted: true,
    purgeFile: (fileKey) => env.MANTTIO_WMS_SHEETS.delete(fileKey),
  });

// ── GET /replenishments/imports/:id/audit ──────────────────────────────────

export const getImportAudit = async (
  db: Db,
  user: AuthUser,
  importId: string,
  query: AuditQuery,
): Promise<{ items: ImportEventDTO[]; total: number }> => {
  const current = await loadImport(db, importId);
  await assertWarehouseAccess(db, user, current.import.warehouseId);

  const { rows, total } = await listImportEventsPaged(db, importId, query.page, query.limit);
  return {
    items: rows.map((row) => ({
      type: row.type,
      actor: row.actorId && row.actorName ? { id: row.actorId, name: row.actorName } : undefined,
      line: opt(row.line),
      reason: opt(row.reason),
      details: row.details as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
  };
};
