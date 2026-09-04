import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { and, asc, eq, inArray, isNull, like } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { env, json, jsonHeaders, request } from './helpers/request';
import { seedOwnerAndLogin } from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import {
  materials,
  materialUnits,
  replenishmentImportEvents,
  replenishmentImportRows,
  replenishmentImports,
  warehouses,
} from '../src/modules/database/schema';
import { MaterialTracking } from '../src/modules/wms/enums/materials.enum';
import type { ReplenishmentFieldMapping } from '../src/modules/wms/types/replenishment-imports.types';
import {
  ImportEventType,
  ReplenishmentImportStatus,
  RowErrorCode,
} from '../src/modules/wms/enums/replenishment-imports.enum';
import {
  failImportFromDeadLetter,
  processImportMessage,
} from '../src/modules/wms/services/import-processor.service';
import { sweepAbandonedImports } from '../src/modules/wms/services/import-retention.service';
import worker from '../src/index';

// The queue consumer (10-wms/11 §2/§3/§4). The handler is called DIRECTLY, per
// 11 §5 — it is a function of (db, env, message), and driving it through the
// queue runtime would test the runtime rather than the parse.
//
// This suite deliberately never calls `POST /imports/:id/process`: that endpoint
// writes the per-tenant mapper-memory singleton, and `wms-replenishments.test.ts`
// snapshots that key. Vitest runs files in parallel, so the two would fight over
// it. Setting `mapping` straight on the row is also closer to what the handler
// actually consumes.

type WorkerEnv = { DATABASE_URL: string; MANTTIO_WMS_SHEETS: R2Bucket };
const workerEnv = () => env as unknown as WorkerEnv;

const FIXTURE_PREFIX = 'wms-test-ip-';
const tag = () => Math.random().toString(36).slice(2, 10);
const wmsName = (scope: string) => `${FIXTURE_PREFIX}${scope}-${tag()}`;
const uniqueSku = () => `IP-${tag().toUpperCase()}`;

const db = () => createDb(workerEnv().DATABASE_URL);

let ownerToken = '';

const okJson = async <T>(res: Response, status = 200): Promise<T> => {
  if (res.status !== status) {
    throw new Error(`expected ${status}, got ${res.status}: ${await res.text()}`);
  }
  return json<T>(res);
};

// ── fixtures ───────────────────────────────────────────────────────────────

const newWarehouse = async () =>
  okJson<{ id: string }>(
    await request('/warehouses', {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ name: wmsName('wh'), locationReference: 'wms-test' }),
    }),
    201,
  );

const newMaterial = async (tracking: MaterialTracking, sku: string) =>
  okJson<{ id: string }>(
    await request('/materials', {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ name: wmsName('mat'), unit: 'pza', tracking, sku }),
    }),
    201,
  );

type UploadBody = { importId: string; fields: { id: string; header: string }[] };

/** Upload through the API so the file really lands in R2 — the handler reads it
 *  back by key, and a hand-inserted row would skip the half most likely to
 *  break. */
const stageFile = async (content: string | ArrayBuffer, fileName = 'lista.csv') => {
  const wh = await newWarehouse();
  const form = new FormData();
  form.set('warehouseId', wh.id);
  form.set('file', new File([content], fileName));
  const res = await request('/replenishments/imports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: form,
  });
  const body = await okJson<UploadBody>(res, 201);
  return { warehouseId: wh.id, ...body };
};

/** Straight to `queued` with a mapping, bypassing `/process` (see the header). */
const armImport = async (importId: string, mapping: ReplenishmentFieldMapping) => {
  await db()
    .update(replenishmentImports)
    .set({ mapping, status: ReplenishmentImportStatus.Queued })
    .where(eq(replenishmentImports.id, importId));
};

const run = (importId: string, attempts = 1) =>
  processImportMessage(db(), env as never, { importId, attempts });

const importRow = async (importId: string) => {
  const [row] = await db()
    .select()
    .from(replenishmentImports)
    .where(eq(replenishmentImports.id, importId));
  if (!row) throw new Error('import vanished');
  return row;
};

const stagedRows = (importId: string) =>
  db()
    .select()
    .from(replenishmentImportRows)
    .where(eq(replenishmentImportRows.importId, importId))
    .orderBy(asc(replenishmentImportRows.line));

const eventTypes = async (importId: string) =>
  (
    await db()
      .select({ type: replenishmentImportEvents.type })
      .from(replenishmentImportEvents)
      .where(eq(replenishmentImportEvents.importId, importId))
  ).map((row) => row.type);

beforeAll(async () => {
  ownerToken = (await seedOwnerAndLogin()).token;
});

afterAll(async () => {
  const conn = db();
  const now = new Date();
  const ours = conn
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(like(warehouses.name, `${FIXTURE_PREFIX}%`));

  const imports = await conn
    .select({ id: replenishmentImports.id })
    .from(replenishmentImports)
    .where(inArray(replenishmentImports.warehouseId, ours));
  const ids = imports.map((row) => row.id);
  if (ids.length > 0) {
    await conn
      .delete(replenishmentImportRows)
      .where(inArray(replenishmentImportRows.importId, ids));
    await conn
      .update(replenishmentImports)
      .set({ status: ReplenishmentImportStatus.Stale })
      .where(inArray(replenishmentImports.id, ids));
  }
  await conn
    .update(warehouses)
    .set({ deletedAt: now })
    .where(and(like(warehouses.name, `${FIXTURE_PREFIX}%`), isNull(warehouses.deletedAt)));
  await conn
    .update(materials)
    .set({ deletedAt: now })
    .where(and(like(materials.name, `${FIXTURE_PREFIX}%`), isNull(materials.deletedAt)));
});

// ── the happy path, all three tracking modes ───────────────────────────────

describe('parsing (11 §2)', () => {
  test('an unserialized sheet becomes clean staged rows, and the file is purged', async () => {
    const sku = uniqueSku();
    const material = await newMaterial(MaterialTracking.Unserialized, sku);
    const staged = await stageFile(`SKU,Cantidad\n${sku},10\n${sku},4\n`);
    await armImport(staged.importId, { sku: 'f0', quantity: 'f1' });

    await run(staged.importId);

    const rows = await stagedRows(staged.importId);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.materialId).toBe(material.id);
    expect(rows[0]?.quantity).toBe('10.000');
    expect(rows.every((row) => row.error === null)).toBe(true);

    const imported = await importRow(staged.importId);
    expect(imported.status).toBe(ReplenishmentImportStatus.Ready);
    expect(imported.totalRows).toBe(2);
    expect(imported.processedRows).toBe(2);
    expect(imported.errorRows).toBe(0);

    // Purged strictly AFTER `ready` commits (11 §2 step 4) — the source file is
    // a copy the tenant still holds.
    expect(imported.fileDeletedAt).not.toBeNull();
    expect(await workerEnv().MANTTIO_WMS_SHEETS.get(imported.fileKey)).toBeNull();

    expect(await eventTypes(staged.importId)).toEqual(
      expect.arrayContaining([ImportEventType.ProcessingStarted, ImportEventType.Processed]),
    );
  });

  test('serialized and lot rows resolve into their own shapes', async () => {
    const serialSku = uniqueSku();
    const lotSku = uniqueSku();
    await newMaterial(MaterialTracking.Serialized, serialSku);
    await newMaterial(MaterialTracking.Lot, lotSku);

    const staged = await stageFile(
      [
        'SKU,Cantidad,Serie,Lote,Caducidad',
        `${serialSku},,SN-${tag()},,`,
        `${lotSku},500,,L-${tag()},2030-05-05`,
      ].join('\n'),
    );
    await armImport(staged.importId, {
      sku: 'f0',
      quantity: 'f1',
      serial: 'f2',
      lot: 'f3',
      expiry: 'f4',
    });

    await run(staged.importId);

    const [serialized, lot] = await stagedRows(staged.importId);
    expect(serialized?.serial).toMatch(/^SN-/);
    expect(serialized?.error).toBeNull();
    expect(lot?.lot).toMatch(/^L-/);
    expect(lot?.quantity).toBe('500.000');
    expect(lot?.lotExpiresAt?.toISOString().slice(0, 10)).toBe('2030-05-05');
    expect(lot?.error).toBeNull();
  });

  test('a real .xlsx workbook parses the same way a csv does', async () => {
    const sku = uniqueSku();
    await newMaterial(MaterialTracking.Unserialized, sku);

    const sheet = XLSX.utils.aoa_to_sheet([
      ['SKU', 'Cantidad'],
      [sku, 7],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Hoja1');
    const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const staged = await stageFile(bytes, 'lista.xlsx');
    // Detection read the same workbook at upload — one implementation, two
    // callers (11 §2).
    expect(staged.fields.map((f) => f.header)).toEqual(['SKU', 'Cantidad']);

    await armImport(staged.importId, { sku: 'f0', quantity: 'f1' });
    await run(staged.importId);

    const rows = await stagedRows(staged.importId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quantity).toBe('7.000');
    expect(rows[0]?.error).toBeNull();
  });

  test('header weirdness does not become data', async () => {
    const sku = uniqueSku();
    await newMaterial(MaterialTracking.Unserialized, sku);
    // A BOM, a quoted delimiter inside a value, a trailing ghost column, and a
    // blank padding row — every one of them a real spreadsheet export.
    const staged = await stageFile(
      `﻿SKU,Nombre,Cantidad,\n${sku},"tornillo, 3/8",6,\n\n`,
    );
    expect(staged.fields.map((f) => f.header)).toEqual(['SKU', 'Nombre', 'Cantidad']);

    await armImport(staged.importId, { sku: 'f0', quantity: 'f2' });
    await run(staged.importId);

    const rows = await stagedRows(staged.importId);
    // The blank line is padding, not a line item.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.quantity).toBe('6.000');
    expect(rows[0]?.error).toBeNull();
  });
});

// ── row errors ─────────────────────────────────────────────────────────────

describe('row errors (11 §2 step 5)', () => {
  test('all six fixable codes come out of one file', async () => {
    const unserialized = uniqueSku();
    const serialized = uniqueSku();
    const lotSku = uniqueSku();
    await newMaterial(MaterialTracking.Unserialized, unserialized);
    await newMaterial(MaterialTracking.Serialized, serialized);
    await newMaterial(MaterialTracking.Lot, lotSku);

    const staged = await stageFile(
      [
        'SKU,Cantidad,Serie,Lote,Caducidad',
        'NO-EXISTE,1,,,', // unknown_sku
        `${unserialized},,,,`, // bad_quantity
        `${serialized},,,,`, // missing_serial
        `${lotSku},5,,,`, // missing_lot
        `${lotSku},5,,L-${tag()},no-es-fecha`, // bad_expiry
        `${serialized},3,SN-${tag()},,`, // quantity_on_serialized
      ].join('\n'),
    );
    await armImport(staged.importId, {
      sku: 'f0',
      quantity: 'f1',
      serial: 'f2',
      lot: 'f3',
      expiry: 'f4',
    });

    await run(staged.importId);

    expect((await stagedRows(staged.importId)).map((row) => row.error)).toEqual([
      RowErrorCode.UnknownSku,
      RowErrorCode.BadQuantity,
      RowErrorCode.MissingSerial,
      RowErrorCode.MissingLot,
      RowErrorCode.BadExpiry,
      RowErrorCode.QuantityOnSerialized,
    ]);

    const imported = await importRow(staged.importId);
    // Row errors do not fail the file — the preview handles them (11 §2 step 4).
    expect(imported.status).toBe(ReplenishmentImportStatus.Ready);
    expect(imported.errorRows).toBe(6);
  });

  test('a repeated serial flags the later line; a repeated lot flags nothing', async () => {
    const serialized = uniqueSku();
    const lotSku = uniqueSku();
    await newMaterial(MaterialTracking.Serialized, serialized);
    await newMaterial(MaterialTracking.Lot, lotSku);
    const serial = `SN-${tag()}`;
    const lot = `L-${tag()}`;

    const staged = await stageFile(
      [
        'SKU,Cantidad,Serie,Lote',
        `${serialized},,${serial},`,
        `${serialized},,${serial},`,
        `${lotSku},100,,${lot}`,
        `${lotSku},50,,${lot}`,
      ].join('\n'),
    );
    await armImport(staged.importId, { sku: 'f0', quantity: 'f1', serial: 'f2', lot: 'f3' });
    await run(staged.importId);

    const rows = await stagedRows(staged.importId);
    // First in-file occurrence wins.
    expect(rows[0]?.error).toBeNull();
    expect(rows[1]?.error).toBe(RowErrorCode.DuplicateSerial);
    // Lot re-receipt is a TOP-UP, not an error (owner 2026-07-20).
    expect(rows[2]?.error).toBeNull();
    expect(rows[3]?.error).toBeNull();
  });

  test('a serial already in the database is flagged from the parse', async () => {
    const sku = uniqueSku();
    const material = await newMaterial(MaterialTracking.Serialized, sku);
    const wh = await newWarehouse();
    const serial = `SN-${tag()}`;
    await db()
      .insert(materialUnits)
      .values({ materialId: material.id, serialNumber: serial, warehouseId: wh.id });

    const staged = await stageFile(`SKU,Serie\n${sku},${serial}\n`);
    await armImport(staged.importId, { sku: 'f0', serial: 'f1' });
    await run(staged.importId);

    expect((await stagedRows(staged.importId))[0]?.error).toBe(RowErrorCode.SerialExists);
  });
});

// ── reliability ────────────────────────────────────────────────────────────

describe('delivery reliability (11 §3)', () => {
  test('a redelivery re-runs without duplicating rows or re-announcing the start', async () => {
    const sku = uniqueSku();
    await newMaterial(MaterialTracking.Unserialized, sku);
    const staged = await stageFile(`SKU,Cantidad\n${sku},2\n${sku},3\n`);
    await armImport(staged.importId, { sku: 'f0', quantity: 'f1' });

    await run(staged.importId, 1);
    // Queues deliver at least once. The second run is the same message again —
    // the import is terminal by now, so it acks silently.
    await run(staged.importId, 2);

    expect(await stagedRows(staged.importId)).toHaveLength(2);
    const types = await eventTypes(staged.importId);
    expect(types.filter((type) => type === ImportEventType.ProcessingStarted)).toHaveLength(1);
    expect(types.filter((type) => type === ImportEventType.Processed)).toHaveLength(1);
  });

  test('a re-run interrupted before the purge completes it, and stages each line once', async () => {
    const sku = uniqueSku();
    await newMaterial(MaterialTracking.Unserialized, sku);
    const staged = await stageFile(`SKU,Cantidad\n${sku},2\n${sku},3\n`);
    await armImport(staged.importId, { sku: 'f0', quantity: 'f1' });

    await run(staged.importId, 1);
    // Rewind to the state a crash between `ready` and the purge leaves behind:
    // `processing`, rows staged, file still in place.
    await db()
      .update(replenishmentImports)
      .set({ status: ReplenishmentImportStatus.Processing, fileDeletedAt: null })
      .where(eq(replenishmentImports.id, staged.importId));
    await workerEnv().MANTTIO_WMS_SHEETS.put(
      (await importRow(staged.importId)).fileKey,
      `SKU,Cantidad\n${sku},2\n${sku},3\n`,
    );

    await run(staged.importId, 2);

    // Upserted on (import_id, line): the redelivery rewrote the same two lines.
    expect(await stagedRows(staged.importId)).toHaveLength(2);
    const imported = await importRow(staged.importId);
    expect(imported.status).toBe(ReplenishmentImportStatus.Ready);
    expect(imported.fileDeletedAt).not.toBeNull();
    // Still only one start event — a retry is not a new job.
    expect(
      (await eventTypes(staged.importId)).filter(
        (type) => type === ImportEventType.ProcessingStarted,
      ),
    ).toHaveLength(1);
  });

  test('an unreadable file fails terminally on the first attempt', async () => {
    const staged = await stageFile('SKU,Cantidad\nA,1\n');
    await armImport(staged.importId, { sku: 'f0', quantity: 'f1' });
    // Replace the staged object with something no parser can make a table of.
    await workerEnv().MANTTIO_WMS_SHEETS.put((await importRow(staged.importId)).fileKey, '   ');

    await run(staged.importId);

    const imported = await importRow(staged.importId);
    // No retry: the file will not get better (11 §2 step 2).
    expect(imported.status).toBe(ReplenishmentImportStatus.Failed);
    expect(imported.error).toBeTruthy();
    expect(await eventTypes(staged.importId)).toContain(ImportEventType.ProcessingFailed);
  });

  test('a missing file fails rather than throwing the job into a retry loop', async () => {
    const staged = await stageFile('SKU,Cantidad\nA,1\n');
    await armImport(staged.importId, { sku: 'f0', quantity: 'f1' });
    await workerEnv().MANTTIO_WMS_SHEETS.delete((await importRow(staged.importId)).fileKey);

    await run(staged.importId);
    expect((await importRow(staged.importId)).status).toBe(ReplenishmentImportStatus.Failed);
  });

  test('the dead-letter path closes the import instead of leaving it processing', async () => {
    const staged = await stageFile('SKU,Cantidad\nA,1\n');
    await armImport(staged.importId, { sku: 'f0', quantity: 'f1' });
    await db()
      .update(replenishmentImports)
      .set({ status: ReplenishmentImportStatus.Processing })
      .where(eq(replenishmentImports.id, staged.importId));

    await failImportFromDeadLetter(db(), { importId: staged.importId });

    const imported = await importRow(staged.importId);
    expect(imported.status).toBe(ReplenishmentImportStatus.Failed);
    expect(imported.error).toBe('max_attempts');
  });

  test('a terminal import is left alone by both consumers', async () => {
    const sku = uniqueSku();
    await newMaterial(MaterialTracking.Unserialized, sku);
    const staged = await stageFile(`SKU,Cantidad\n${sku},2\n`);
    await armImport(staged.importId, { sku: 'f0', quantity: 'f1' });
    await run(staged.importId);

    // The user cancelled while a stale message was still in flight.
    await db()
      .update(replenishmentImports)
      .set({ status: ReplenishmentImportStatus.Cancelled })
      .where(eq(replenishmentImports.id, staged.importId));

    await run(staged.importId, 3);
    await failImportFromDeadLetter(db(), { importId: staged.importId });

    // Neither consumer fights the user's decision.
    expect((await importRow(staged.importId)).status).toBe(
      ReplenishmentImportStatus.Cancelled,
    );
  });

  test('the queue() export routes the import queue and its DLQ apart', async () => {
    const sku = uniqueSku();
    await newMaterial(MaterialTracking.Unserialized, sku);
    const processed = await stageFile(`SKU,Cantidad\n${sku},9\n`);
    await armImport(processed.importId, { sku: 'f0', quantity: 'f1' });

    const acked: string[] = [];
    const message = (queueName: string, importId: string) => ({
      id: importId,
      timestamp: new Date(),
      body: { importId },
      attempts: 1,
      ack: () => acked.push(queueName),
      retry: () => {
        throw new Error('unexpected retry');
      },
    });

    await worker.queue(
      {
        queue: 'manttio-wms-imports',
        messages: [message('main', processed.importId)],
        ackAll: () => {},
        retryAll: () => {},
      } as never,
      env as never,
    );
    expect((await importRow(processed.importId)).status).toBe(
      ReplenishmentImportStatus.Ready,
    );

    const dead = await stageFile(`SKU,Cantidad\n${sku},1\n`);
    await armImport(dead.importId, { sku: 'f0', quantity: 'f1' });
    await worker.queue(
      {
        queue: 'manttio-wms-imports-dlq',
        messages: [message('dlq', dead.importId)],
        ackAll: () => {},
        retryAll: () => {},
      } as never,
      env as never,
    );
    expect((await importRow(dead.importId)).status).toBe(ReplenishmentImportStatus.Failed);
    expect(acked).toEqual(['main', 'dlq']);
  });
});

// ── retention ──────────────────────────────────────────────────────────────

describe('retention sweep (11 §4)', () => {
  test('an abandoned import loses its file and its staged rows, never its header', async () => {
    const sku = uniqueSku();
    await newMaterial(MaterialTracking.Unserialized, sku);
    const staged = await stageFile(`SKU,Cantidad\n${sku},2\n`);
    await armImport(staged.importId, { sku: 'f0', quantity: 'f1' });
    await run(staged.importId);

    // Abandoned, and older than the window.
    const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    await db()
      .update(replenishmentImports)
      .set({ status: ReplenishmentImportStatus.Stale, updatedAt: old })
      .where(eq(replenishmentImports.id, staged.importId));

    expect(await sweepAbandonedImports(db(), env as never)).toBeGreaterThanOrEqual(1);

    expect(await stagedRows(staged.importId)).toHaveLength(0);
    // The header survives: file name, submission snapshot and the event log are
    // the point of it outliving its data.
    const imported = await importRow(staged.importId);
    expect(imported.fileName).toBeTruthy();
    expect(await eventTypes(staged.importId)).toContain(ImportEventType.Created);
  });

  test('a recent import is left alone', async () => {
    const sku = uniqueSku();
    await newMaterial(MaterialTracking.Unserialized, sku);
    const staged = await stageFile(`SKU,Cantidad\n${sku},2\n`);
    await armImport(staged.importId, { sku: 'f0', quantity: 'f1' });
    await run(staged.importId);
    await db()
      .update(replenishmentImports)
      .set({ status: ReplenishmentImportStatus.Stale })
      .where(eq(replenishmentImports.id, staged.importId));

    await sweepAbandonedImports(db(), env as never);
    expect(await stagedRows(staged.importId)).toHaveLength(1);
  });
});
