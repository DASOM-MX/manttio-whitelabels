import type { Env } from '../../../env';
import type { Db } from '../../database/client';
import { NotificationType } from '../../notifications/enums/notifications.enum';
import { notifyBestEffort } from '../../notifications/services/notifications.service';
import { PROGRESS_BATCH_ROWS } from '../constants/import-limits';
import { WMS_SETTING_KEYS } from '../constants/wms-setting-keys';
import { MaterialTracking } from '../enums/materials.enum';
import {
  ImportEventType,
  ReplenishmentImportStatus,
  RowErrorCode,
} from '../enums/replenishment-imports.enum';
import { validateStagedRow } from '../helpers/import-rows.helpers';
import { readRows } from '../helpers/sheet-parse.helpers';
import { findMaterialByCode } from '../repository/materials.repository';
import { insertImportEvent } from '../repository/replenishment-import-events.repository';
import {
  countStagedRows,
  upsertStagedRows,
} from '../repository/replenishment-import-rows.repository';
import {
  findImportById,
  updateImportRow,
} from '../repository/replenishment-imports.repository';
import { findExistingSerials } from '../repository/stock-balances.repository';
import { getSetting } from './wms-settings.service';
import type {
  MaterialRow,
} from '../types/materials.types';
import type {
  NewImportStagedRow,
  ReplenishmentFieldMapping,
  ReplenishmentImportRow,
} from '../types/replenishment-imports.types';

// The queue consumer's handler (10-wms/11 §2). It turns a staged file into
// validated staging rows, and does NOTHING else: no stock math, no movements,
// no folio — those belong to the approval transaction (01 §3). Its only status
// writes are `processing → ready | failed`.
//
// Queues deliver AT LEAST ONCE, so every step here is written to survive being
// run twice on the same message.

/** Terminal states ack silently: a redelivery arriving after the job already
 *  finished (or was cancelled underneath it) is not an error, and retrying it
 *  would either duplicate work or fight the user's decision. */
const TERMINAL: ReplenishmentImportStatus[] = [
  ReplenishmentImportStatus.Ready,
  ReplenishmentImportStatus.Failed,
  ReplenishmentImportStatus.Confirmed,
  ReplenishmentImportStatus.Stale,
  ReplenishmentImportStatus.Cancelled,
];

interface ParsedRow {
  line: number;
  raw: Record<string, string>;
  code: string;
  material: MaterialRow | null;
  quantity: string | null;
  pieces: number | null;
  serial: string | null;
  lot: string | null;
  lotExpiresAt: Date | null;
  expiryUnresolved: boolean;
}

/** A sheet cell is text by the time it reaches here (`raw: false`), so this is
 *  the one place a number is read out of a string. Blank means absent, not
 *  zero — a blank quantity is `bad_quantity`, and zero would silently pass a
 *  positivity check the reviewer never saw. */
const numberOrNull = (value: string | undefined): string | null => {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? String(parsed) : null;
};

const textOrNull = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

/** Excel hands dates back as displayed text, which varies by locale, so this
 *  accepts what `Date` accepts and treats everything else as `bad_expiry`
 *  rather than guessing at `03/04/2026`. */
const dateOrInvalid = (value: string | undefined): { date: Date | null; invalid: boolean } => {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') return { date: null, invalid: false };
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? { date: null, invalid: true } : { date: parsed, invalid: false };
};

/** Reads the file through the mapping the user submitted, resolving each mapped
 *  target to its column index via the `detected_fields` snapshot taken at
 *  upload — so a file re-read here is interpreted exactly as the mapper screen
 *  presented it. */
const parseRows = async (
  db: Db,
  imported: ReplenishmentImportRow,
  rows: string[][],
): Promise<ParsedRow[]> => {
  const mapping = imported.mapping as ReplenishmentFieldMapping;
  const fields = imported.detectedFields;
  const columnOf = (fieldId: string | undefined) => {
    if (fieldId === undefined) return -1;
    const index = fields.findIndex((field) => field.id === fieldId);
    return index;
  };

  const columns = {
    sku: columnOf(mapping.sku),
    quantity: columnOf(mapping.quantity),
    pieces: columnOf(mapping.pieces),
    serial: columnOf(mapping.serial),
    lot: columnOf(mapping.lot),
    expiry: columnOf(mapping.expiry),
  };
  const at = (row: string[], column: number) => (column < 0 ? undefined : row[column]);

  // Resolved once per distinct code, not once per row: a 2000-line sheet of 30
  // products is 30 lookups, not 2000.
  const resolved = new Map<string, MaterialRow | null>();
  const resolve = async (code: string) => {
    if (!resolved.has(code)) resolved.set(code, await findMaterialByCode(db, code));
    return resolved.get(code) ?? null;
  };

  const parsed: ParsedRow[] = [];
  // `line` is the 1-based DATA line, header excluded — what the review table
  // numbers, and what a `row_updated` event points at.
  const body = rows.slice(1);
  for (let index = 0; index < body.length; index += 1) {
    const row = body[index] ?? [];
    // A row that is entirely blank is spreadsheet padding, not a line item.
    if (row.every((cell) => (cell ?? '').trim() === '')) continue;

    const code = textOrNull(at(row, columns.sku)) ?? '';
    const expiry = dateOrInvalid(at(row, columns.expiry));
    const raw: Record<string, string> = {};
    for (const [target, column] of Object.entries(columns)) {
      if (column >= 0) raw[fields[column]?.header ?? target] = at(row, column) ?? '';
    }

    parsed.push({
      line: index + 1,
      raw,
      code,
      material: code === '' ? null : await resolve(code),
      quantity: numberOrNull(at(row, columns.quantity)),
      pieces: (() => {
        const value = numberOrNull(at(row, columns.pieces));
        return value === null ? null : Number(value);
      })(),
      serial: textOrNull(at(row, columns.serial)),
      lot: textOrNull(at(row, columns.lot)),
      lotExpiresAt: expiry.date,
      expiryUnresolved: expiry.invalid,
    });
  }
  return parsed;
};

/** Which serials are already claimed in the database, one query per material
 *  rather than one per row. */
const claimedSerials = async (db: Db, parsed: ParsedRow[]): Promise<Set<string>> => {
  const byMaterial = new Map<string, string[]>();
  for (const row of parsed) {
    if (!row.material || row.material.tracking !== MaterialTracking.Serialized) continue;
    if (row.serial === null) continue;
    const list = byMaterial.get(row.material.id) ?? [];
    list.push(row.serial);
    byMaterial.set(row.material.id, list);
  }

  const claimed = new Set<string>();
  for (const [materialId, serials] of byMaterial) {
    for (const serial of await findExistingSerials(db, materialId, serials)) {
      // Keyed by material too: two vendors may reuse a serial across products.
      claimed.add(`${materialId}::${serial}`);
    }
  }
  return claimed;
};

/** Stamps the error code on every row. The FIXABLE-vs-UNPROCESSABLE split is
 *  deliberately not applied here (11 §2) — the handler records what it found;
 *  the approval gate and the UI decide what that means. */
const stampErrors = (parsed: ParsedRow[], claimed: Set<string>): NewImportStagedRow[] => {
  // First in-file occurrence of a serial stays clean; later ones are flagged
  // (11 §2). Lot numbers are NOT in here on purpose: a repeat lot is a
  // re-receipt that tops up at approval, never an error.
  const seenSerials = new Set<string>();

  return parsed.map((row) => {
    const serialized = row.material?.tracking === MaterialTracking.Serialized;
    const serialKey = row.material && row.serial ? `${row.material.id}::${row.serial}` : null;

    let duplicateInFile = false;
    if (serialized && serialKey) {
      duplicateInFile = seenSerials.has(serialKey);
      seenSerials.add(serialKey);
    }

    const error = validateStagedRow({
      tracking: row.material?.tracking ?? null,
      quantity: row.quantity,
      serial: row.serial,
      lot: row.lot,
      expiryUnresolved: row.expiryUnresolved,
      serialDuplicateInFile: duplicateInFile,
      serialClaimedInDb: serialKey !== null && claimed.has(serialKey),
    });

    return {
      importId: '',
      line: row.line,
      raw: row.raw,
      materialId: row.material?.id ?? null,
      quantity: row.quantity,
      pieces: row.pieces,
      serial: row.serial,
      lot: row.lot,
      lotExpiresAt: row.lotExpiresAt,
      error,
    };
  });
};

/** `ready` and `failed` both warn the configured CMS-manager (11 §2 step 4).
 *  Best-effort by contract: a notification failure must never fail the job or
 *  block the status write, because the superadmin banner and the pending strip
 *  are the reliable floor.
 *
 *  ONE recipient, addressed directly — never a role broadcast. `notify()`
 *  inserts a row per resolved recipient, so broadcasting to owner/admin costs
 *  one row per user in the tenant every time an import finishes; the plan
 *  specifies a single configured manager precisely because this fires on a hot
 *  path. An unconfigured recipient is SKIPPED, which the plan also says
 *  explicitly — silence is the correct fallback here, not a wider audience.
 *
 *  The key still lodges in the WMS settings store while the notifications
 *  module has no store of its own (02 §1). */
const notifyOutcome = async (
  db: Db,
  imported: ReplenishmentImportRow,
  outcome: { ready: true; total: number; errors: number } | { ready: false; error: string },
) => {
  const managerUserId = await getSetting<string | null>(
    db,
    WMS_SETTING_KEYS.notificationsManagerUserId,
    null,
  );
  if (!managerUserId) return;

  const common = {
    recipientUserId: managerUserId,
    data: { importId: imported.id, warehouseId: imported.warehouseId },
  };

  if (outcome.ready) {
    await notifyBestEffort(db, {
      ...common,
      type: NotificationType.ReplenishmentReady,
      title: 'Reabastecimiento listo para aprobar',
      body:
        outcome.errors > 0
          ? `${imported.fileName}: ${outcome.total} líneas, ${outcome.errors} con observaciones.`
          : `${imported.fileName}: ${outcome.total} líneas listas.`,
      data: { ...common.data, errors: outcome.errors },
    });
    return;
  }
  await notifyBestEffort(db, {
    ...common,
    type: NotificationType.ReplenishmentFailed,
    title: 'Un reabastecimiento no pudo procesarse',
    body: `${imported.fileName}: ${outcome.error}`,
  });
};

const failImport = async (db: Db, imported: ReplenishmentImportRow, error: string) => {
  await db.transaction(async (tx) => {
    await updateImportRow(tx, imported.id, {
      status: ReplenishmentImportStatus.Failed,
      error,
    });
    await insertImportEvent(tx, {
      importId: imported.id,
      type: ImportEventType.ProcessingFailed,
      // System actor — the consumer has no user (01 §2).
      actorUserId: null,
      details: { error },
    });
  });
  await notifyOutcome(db, imported, { ready: false, error });
};

/** The handler. Returns nothing: the queue runtime acks on resolution and
 *  retries on throw, so "ack" here means "return", and "retry" means "throw". */
export const processImportMessage = async (
  db: Db,
  env: Env,
  message: { importId: string; attempts: number },
): Promise<void> => {
  const found = await findImportById(db, message.importId);
  if (!found) {
    // The row is gone or was never there; retrying cannot change that.
    console.warn(`import ${message.importId} not found — acking`);
    return;
  }
  const imported = found.import;

  // Stale redelivery after the job already reached an end state.
  if (TERMINAL.includes(imported.status)) return;

  // A redelivery is a re-run, not a second run: the timeline records the first
  // start only, or retries would spam it.
  const redelivery = imported.status === ReplenishmentImportStatus.Processing;
  await db.transaction(async (tx) => {
    await updateImportRow(tx, imported.id, {
      status: ReplenishmentImportStatus.Processing,
      // Visibility only — Queues owns retry state (11 §3).
      attempts: message.attempts,
    });
    if (!redelivery) {
      await insertImportEvent(tx, {
        importId: imported.id,
        type: ImportEventType.ProcessingStarted,
        actorUserId: null,
        details: {},
      });
    }
  });

  // ── read the file ────────────────────────────────────────────────────────
  const object = await env.MANTTIO_WMS_SHEETS.get(imported.fileKey);
  if (!object) {
    await failImport(db, imported, 'the uploaded file is no longer available');
    return;
  }

  let rows: string[][];
  try {
    rows = readRows(imported.fileName, await object.arrayBuffer());
  } catch (err) {
    // Terminal on the FIRST attempt, and acked: an unreadable file will not
    // get better on a retry, and looping on it is what the DLQ is for
    // elsewhere (11 §3).
    await failImport(db, imported, err instanceof Error ? err.message : 'unreadable file');
    return;
  }

  if (imported.mapping === null) {
    await failImport(db, imported, 'the import has no field mapping');
    return;
  }

  // ── walk it ──────────────────────────────────────────────────────────────
  const parsed = await parseRows(db, imported, rows);
  await updateImportRow(db, imported.id, { totalRows: parsed.length });

  const staged = stampErrors(parsed, await claimedSerials(db, parsed));
  const errors = staged.filter((row) => row.error !== null).length;

  // Written in batches so the progress bar the SSE stream feeds actually
  // moves on a long file (11 §2 step 3), and so one oversized statement never
  // carries the whole sheet.
  for (let offset = 0; offset < staged.length; offset += PROGRESS_BATCH_ROWS) {
    const batch = staged.slice(offset, offset + PROGRESS_BATCH_ROWS);
    await db.transaction(async (tx) => {
      await upsertStagedRows(
        tx,
        batch.map((row) => ({ ...row, importId: imported.id })),
      );
      await updateImportRow(tx, imported.id, {
        processedRows: Math.min(offset + batch.length, staged.length),
        errorRows: staged.slice(0, offset + batch.length).filter((r) => r.error !== null).length,
      });
    });
  }

  // A redelivery that resumed mid-file may have staged rows the new read no
  // longer produces (an edited sheet). The counters are re-derived from what
  // is actually there rather than from this run's arithmetic.
  const total = await countStagedRows(db, imported.id);

  await db.transaction(async (tx) => {
    await updateImportRow(tx, imported.id, {
      status: ReplenishmentImportStatus.Ready,
      totalRows: total,
      processedRows: total,
      errorRows: errors,
      error: null,
    });
    await insertImportEvent(tx, {
      importId: imported.id,
      type: ImportEventType.Processed,
      actorUserId: null,
      details: { total, errors },
    });
  });

  // STRICTLY after `ready` commits (11 §2 step 4): a crash between the two
  // redelivers with the file still in place, which is recoverable. Purging
  // first and then crashing would not be.
  await env.MANTTIO_WMS_SHEETS.delete(imported.fileKey);
  await updateImportRow(db, imported.id, { fileDeletedAt: new Date() });

  await notifyOutcome(db, imported, { ready: true, total, errors });
};

/** The DLQ consumer (11 §3): a message that burned its retries closes the
 *  import as `failed` so the user sees a failure card and re-uploads, instead
 *  of an import sitting in `processing` forever. */
export const failImportFromDeadLetter = async (
  db: Db,
  message: { importId: string },
): Promise<void> => {
  const found = await findImportById(db, message.importId);
  if (!found) return;
  if (TERMINAL.includes(found.import.status)) return;
  await failImport(db, found.import, 'max_attempts');
};
