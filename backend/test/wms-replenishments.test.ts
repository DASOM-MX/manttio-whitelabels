import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { and, eq, inArray, isNull, like } from 'drizzle-orm';
import { env, json, jsonHeaders, request } from './helpers/request';
import {
  seedAdminAndLogin,
  seedOfficeAndLogin,
  seedOwnerAndLogin,
  seedTechnicianAndLogin,
} from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import {
  materials,
  materialUnits,
  replenishmentImportRows,
  replenishmentImports,
  storageNodes,
  warehouses,
} from '../src/modules/database/schema';
import { MaterialTracking } from '../src/modules/wms/enums/materials.enum';
import {
  ImportEventType,
  ReplenishmentImportStatus,
  RowErrorCode,
} from '../src/modules/wms/enums/replenishment-imports.enum';
import { WMS_SETTING_KEYS } from '../src/modules/wms/constants/wms-setting-keys';
import { getSetting, setSetting } from '../src/modules/wms/services/wms-settings.service';

// The replenishment import lifecycle (10-wms/02 §6): upload → map → queue →
// review → decision. The queue consumer (11) is a later slice, so the tests
// that need STAGED ROWS insert them directly — the same posture the materials
// suite took toward stock rows before the stock slice existed.
//
// Import headers are never deleted (01 §2), so `afterAll` retires them to
// `stale` instead: that releases the one-in-flight slot without pretending the
// row can go away.

type WorkerEnv = { DATABASE_URL: string };

const FIXTURE_PREFIX = 'wms-test-rp-';
const tag = () => Math.random().toString(36).slice(2, 10);
const wmsName = (scope: string) => `${FIXTURE_PREFIX}${scope}-${tag()}`;

const db = () => createDb((env as unknown as WorkerEnv).DATABASE_URL);

let ownerToken = '';
let adminToken = '';
let officeToken = '';
let techToken = '';

/** The mapper memory is a PER-TENANT SINGLETON (`wms_settings`), so it cannot
 *  be isolated by a fixture prefix the way rows can. `backend/CLAUDE.md`'s rule
 *  for exactly this case: snapshot in `beforeAll`, restore in `afterAll` — and
 *  in between, park it on headers no fixture file can match, so "no suggestion
 *  offered" is a deterministic assertion instead of a bet on run order. */
const NO_MATCH_MAPPING = {
  headers: ['__wms_test_absent__'],
  mapping: { sku: '__wms_test_absent__' },
};
let rememberedMapping: unknown = null;

const okJson = async <T>(res: Response, status = 200): Promise<T> => {
  if (res.status !== status) {
    throw new Error(`expected ${status}, got ${res.status}: ${await res.text()}`);
  }
  return json<T>(res);
};

const errorOf = async (res: Response) => (await json<{ error: string }>(res)).error;

// ── fixtures ───────────────────────────────────────────────────────────────

const newWarehouse = async (body: object = {}) =>
  okJson<{ id: string }>(
    await request('/warehouses', {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ name: wmsName('wh'), locationReference: 'wms-test', ...body }),
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

const CSV = ['SKU,Cantidad,Lote', 'ABC-1,10,L-1', 'ABC-2,4,L-2', 'ABC-3,7,L-3'].join('\n');

const upload = (
  token: string,
  warehouseId: string,
  content = CSV,
  fileName = 'lista.csv',
) => {
  const form = new FormData();
  form.set('warehouseId', warehouseId);
  form.set('file', new File([content], fileName, { type: 'text/csv' }));
  return request('/replenishments/imports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
};

type UploadBody = {
  importId: string;
  fileName: string;
  fields: { id: string; header: string; samples: string[] }[];
  suggestedMapping?: Record<string, string>;
};

const seedImport = async (warehouseId?: string) => {
  const wh = warehouseId ?? (await newWarehouse()).id;
  const body = await okJson<UploadBody>(await upload(ownerToken, wh), 201);
  return { warehouseId: wh, ...body };
};

/** The consumer's output, written by hand — this slice hands off to the queue
 *  and picks up again once rows exist. */
const stageRows = async (
  importId: string,
  rows: {
    line: number;
    materialId?: string | null;
    quantity?: string | null;
    serial?: string | null;
    lot?: string | null;
    error?: RowErrorCode | null;
  }[],
) => {
  await db()
    .insert(replenishmentImportRows)
    .values(
      rows.map((row) => ({
        importId,
        line: row.line,
        raw: { SKU: 'ABC-1', Cantidad: row.quantity ?? '' },
        materialId: row.materialId ?? null,
        quantity: row.quantity ?? null,
        serial: row.serial ?? null,
        lot: row.lot ?? null,
        error: row.error ?? null,
      })),
    );
};

const setStatus = async (importId: string, status: ReplenishmentImportStatus) => {
  await db()
    .update(replenishmentImports)
    .set({ status })
    .where(eq(replenishmentImports.id, importId));
};

/** Straight to `ready` with staged rows — the state most endpoints care about. */
const seedReadyImport = async (rows: Parameters<typeof stageRows>[1] = []) => {
  const imported = await seedImport();
  if (rows.length > 0) await stageRows(imported.importId, rows);
  await setStatus(imported.importId, ReplenishmentImportStatus.Ready);
  return imported;
};

beforeAll(async () => {
  const [owner, admin, office, tech] = await Promise.all([
    seedOwnerAndLogin(),
    seedAdminAndLogin(),
    seedOfficeAndLogin(),
    seedTechnicianAndLogin(),
  ]);
  ownerToken = owner.token;
  adminToken = admin.token;
  officeToken = office.token;
  techToken = tech.token;

  rememberedMapping = await getSetting(db(), WMS_SETTING_KEYS.lastReplenishmentMapping, null);
  await setSetting(db(), WMS_SETTING_KEYS.lastReplenishmentMapping, NO_MATCH_MAPPING);
});

afterAll(async () => {
  const conn = db();
  const now = new Date();

  // The tenant's real mapper memory goes back exactly as it was; the suite
  // overwrote it several times on the way through.
  if (rememberedMapping !== null) {
    await setSetting(conn, WMS_SETTING_KEYS.lastReplenishmentMapping, rememberedMapping);
  } else {
    await setSetting(conn, WMS_SETTING_KEYS.lastReplenishmentMapping, NO_MATCH_MAPPING);
  }
  const ours = conn
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(like(warehouses.name, `${FIXTURE_PREFIX}%`));

  // Staging is scratch (01 §2, the module's one sanctioned hard delete), so it
  // goes; the headers only retire.
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
    .update(storageNodes)
    .set({ deletedAt: now })
    .where(and(like(storageNodes.name, `${FIXTURE_PREFIX}%`), isNull(storageNodes.deletedAt)));
  await conn
    .update(warehouses)
    .set({ deletedAt: now, assignedUserId: null, assignmentRole: null })
    .where(and(like(warehouses.name, `${FIXTURE_PREFIX}%`), isNull(warehouses.deletedAt)));
  await conn
    .update(materials)
    .set({ deletedAt: now })
    .where(and(like(materials.name, `${FIXTURE_PREFIX}%`), isNull(materials.deletedAt)));
});

// ── upload + field detection ───────────────────────────────────────────────

describe('upload + field detection (02 §6)', () => {
  test('the header row becomes the mapper fields, with sample values', async () => {
    const wh = await newWarehouse();
    const body = await okJson<UploadBody>(await upload(ownerToken, wh.id), 201);

    expect(body.fileName).toBe('lista.csv');
    expect(body.fields.map((f) => f.header)).toEqual(['SKU', 'Cantidad', 'Lote']);
    // Samples come from the data rows, capped — never the whole file.
    expect(body.fields[0]?.samples).toEqual(['ABC-1', 'ABC-2', 'ABC-3']);
    // Nothing remembered matches these headers (see NO_MATCH_MAPPING).
    expect(body.suggestedMapping).toBeUndefined();

    const status = await okJson<{ status: string; warehouse: { id: string } }>(
      await request(`/replenishments/imports/${body.importId}`, {
        headers: jsonHeaders(ownerToken),
      }),
    );
    expect(status.status).toBe(ReplenishmentImportStatus.Uploaded);
    // Warehouse-first: bound at creation, not at mapping.
    expect(status.warehouse.id).toBe(wh.id);
  });

  test('the delimiter is sniffed, not assumed', async () => {
    for (const [content, headers] of [
      ['A;B;C\n1;2;3', ['A', 'B', 'C']],
      ['A\tB\n1\t2', ['A', 'B']],
      // Quoted commas belong to the value, not to the split.
      ['A,B\n"uno, dos",3', ['A', 'B']],
    ] as const) {
      const wh = await newWarehouse();
      const body = await okJson<UploadBody>(await upload(ownerToken, wh.id, content), 201);
      expect(body.fields.map((f) => f.header)).toEqual([...headers]);
    }

    const quoted = await newWarehouse();
    const body = await okJson<UploadBody>(
      await upload(ownerToken, quoted.id, 'A,B\n"uno, dos",3'),
      201,
    );
    expect(body.fields[0]?.samples).toEqual(['uno, dos']);
  });

  test('a file we cannot read leaves no import behind', async () => {
    const wh = await newWarehouse();

    const empty = await upload(ownerToken, wh.id, '   ');
    expect(empty.status).toBe(400);
    expect(await errorOf(empty)).toBe('unparseable_file');

    // One column is not a table — nothing to map.
    const single = await upload(ownerToken, wh.id, 'SoloUna\n1\n2');
    expect(await errorOf(single)).toBe('unparseable_file');

    // A blank header cannot be mapped or remembered.
    const blankHeader = await upload(ownerToken, wh.id, 'SKU,,Lote\n1,2,3');
    expect(await errorOf(blankHeader)).toBe('unparseable_file');

    const wrongType = await upload(ownerToken, wh.id, CSV, 'lista.pdf');
    expect(await errorOf(wrongType)).toBe('unparseable_file');

    // The refusal is total: the warehouse's slot is still free afterwards.
    expect((await upload(ownerToken, wh.id)).status).toBe(201);
  });

  test('a file over the size cap is refused as too large, not as unreadable', async () => {
    const wh = await newWarehouse();
    const huge = `SKU,Cantidad\n${'ABC-1,1\n'.repeat(200_000)}`;
    const res = await upload(ownerToken, wh.id, huge);
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe('file_too_large');
  });

  test('one import in flight per PARENT warehouse — a van shares its parent slot', async () => {
    const parent = await newWarehouse();
    const child = await newWarehouse({ parentId: parent.id });

    const first = await okJson<UploadBody>(await upload(ownerToken, parent.id), 201);

    const second = await upload(ownerToken, parent.id);
    expect(second.status).toBe(409);
    const body = await json<{ error: string; importId: string }>(second);
    expect(body.error).toBe('import_in_progress');
    // The client resumes that one instead of starting over (07 §2).
    expect(body.importId).toBe(first.importId);

    // The sub-warehouse is blocked by its parent's slot, not by its own.
    expect((await upload(ownerToken, child.id)).status).toBe(409);

    // A different parent imports concurrently.
    const other = await newWarehouse();
    expect((await upload(ownerToken, other.id)).status).toBe(201);
  });

  test('prep roles may upload; technicians may not', async () => {
    const wh = await newWarehouse();
    expect((await upload(techToken, wh.id)).status).toBe(403);
    expect((await upload(officeToken, wh.id)).status).toBe(201);
  });
});

// ── mapping + hand-off ─────────────────────────────────────────────────────

const mappingFor = (fields: UploadBody['fields']) => ({
  sku: fields[0]!.id,
  quantity: fields[1]!.id,
});

describe('mapping + queue hand-off (02 §6)', () => {
  test('a valid mapping is accepted with 202 and queues the job', async () => {
    const imported = await seedImport();
    const res = await request(`/replenishments/imports/${imported.importId}/process`, {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ mapping: mappingFor(imported.fields) }),
    });
    // Accepted, not done — the consumer owns the rest.
    expect(res.status).toBe(202);
    expect(await json<{ status: string }>(res)).toMatchObject({
      status: ReplenishmentImportStatus.Queued,
    });

    const status = await okJson<{
      status: string;
      mapping: Record<string, string>;
      submissionSnapshot: string;
    }>(
      await request(`/replenishments/imports/${imported.importId}`, {
        headers: jsonHeaders(ownerToken),
      }),
    );
    expect(status.status).toBe(ReplenishmentImportStatus.Queued);
    expect(status.mapping.sku).toBe(imported.fields[0]!.id);
    // Pretty-printed plain text, exportable as-is (owner 2026-07-20).
    expect(status.submissionSnapshot).toContain('\n  "fileName": "lista.csv"');
    expect(JSON.parse(status.submissionSnapshot).mapping.sku).toBe(imported.fields[0]!.id);
  });

  test('the mapping must name a SKU column and something to receive', async () => {
    const imported = await seedImport();
    const send = (mapping: object) =>
      request(`/replenishments/imports/${imported.importId}/process`, {
        method: 'POST',
        headers: jsonHeaders(ownerToken),
        body: JSON.stringify({ mapping }),
      });

    expect((await send({ quantity: imported.fields[1]!.id })).status).toBe(400);
    expect((await send({ sku: imported.fields[0]!.id })).status).toBe(400);
    // Expiry and pieces are properties OF a lot; alone they date nothing.
    expect(
      (await send({ sku: imported.fields[0]!.id, expiry: imported.fields[2]!.id })).status,
    ).toBe(400);

    // A field id this file does not have.
    const unknown = await send({ sku: 'f99', quantity: imported.fields[1]!.id });
    expect(unknown.status).toBe(400);
    expect(await errorOf(unknown)).toBe('invalid_mapping');
  });

  test('a mapping may only be submitted once', async () => {
    const imported = await seedImport();
    const send = () =>
      request(`/replenishments/imports/${imported.importId}/process`, {
        method: 'POST',
        headers: jsonHeaders(ownerToken),
        body: JSON.stringify({ mapping: mappingFor(imported.fields) }),
      });
    expect((await send()).status).toBe(202);

    const again = await send();
    expect(again.status).toBe(409);
    expect(await errorOf(again)).toBe('import_not_pending');
  });

  test('the next file with the same headers arrives pre-mapped', async () => {
    const first = await seedImport();
    await request(`/replenishments/imports/${first.importId}/process`, {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ mapping: mappingFor(first.fields) }),
    });

    const next = await seedImport();
    // Remembered by HEADER TEXT and resolved back to THIS import's field ids.
    expect(next.suggestedMapping?.sku).toBe(next.fields[0]!.id);
    expect(next.suggestedMapping?.quantity).toBe(next.fields[1]!.id);

    // Different headers, no suggestion — a partial prefill would be worse than
    // none.
    const other = await newWarehouse();
    const different = await okJson<UploadBody>(
      await upload(ownerToken, other.id, 'Codigo,Piezas\nX,1'),
      201,
    );
    expect(different.suggestedMapping).toBeUndefined();
  });
});

// ── staged-row review ──────────────────────────────────────────────────────

describe('staged-row review (02 §6)', () => {
  test('a quantity correction is a first-class edit, not just an error fix', async () => {
    const material = await newMaterial(MaterialTracking.Unserialized, `RP-${tag().toUpperCase()}`);
    const imported = await seedReadyImport([
      { line: 1, materialId: material.id, quantity: '100' },
    ]);

    const row = await okJson<{ quantity: string; error?: string }>(
      await request(`/replenishments/imports/${imported.importId}/rows/1`, {
        method: 'PATCH',
        headers: jsonHeaders(officeToken),
        body: JSON.stringify({ quantity: 95 }),
      }),
    );
    expect(row.quantity).toBe('95');
    expect(row.error).toBeUndefined();

    const audit = await okJson<{ items: { type: string; line?: number; details: object }[] }>(
      await request(`/replenishments/imports/${imported.importId}/audit`, {
        headers: jsonHeaders(ownerToken),
      }),
    );
    const updated = audit.items.find((item) => item.type === ImportEventType.RowUpdated);
    expect(updated?.line).toBe(1);
    // Per-field before/after, so the timeline says what actually moved.
    expect(updated?.details).toMatchObject({ quantity: { from: '100', to: '95' } });
  });

  test('an unknown code re-resolves when the reviewer fixes it', async () => {
    const sku = `RP-${tag().toUpperCase()}`;
    const material = await newMaterial(MaterialTracking.Unserialized, sku);
    const imported = await seedReadyImport([
      { line: 1, materialId: null, quantity: '3', error: RowErrorCode.UnknownSku },
    ]);

    const row = await okJson<{ material?: { id: string }; error?: string }>(
      await request(`/replenishments/imports/${imported.importId}/rows/1`, {
        method: 'PATCH',
        headers: jsonHeaders(officeToken),
        body: JSON.stringify({ code: sku }),
      }),
    );
    expect(row.material?.id).toBe(material.id);
    expect(row.error).toBeUndefined();
  });

  test('re-validation runs the parser rules, so a fix can reveal the next problem', async () => {
    const serialized = await newMaterial(MaterialTracking.Serialized, `RP-${tag().toUpperCase()}`);
    const imported = await seedReadyImport([
      { line: 1, materialId: serialized.id, serial: null, error: RowErrorCode.MissingSerial },
    ]);
    const patch = (body: object) =>
      request(`/replenishments/imports/${imported.importId}/rows/1`, {
        method: 'PATCH',
        headers: jsonHeaders(officeToken),
        body: JSON.stringify(body),
      });

    // A serialized row is one piece; two is not something the row can say.
    const withQuantity = await okJson<{ error?: string }>(
      await patch({ serial: `SN-${tag()}`, quantity: 2 }),
    );
    expect(withQuantity.error).toBe(RowErrorCode.QuantityOnSerialized);

    const fixed = await okJson<{ error?: string }>(await patch({ quantity: 1 }));
    expect(fixed.error).toBeUndefined();
  });

  test('a serial already in the database is flagged unprocessable, not fixable', async () => {
    const serialized = await newMaterial(MaterialTracking.Serialized, `RP-${tag().toUpperCase()}`);
    const wh = await newWarehouse();
    const serial = `SN-${tag()}`;
    await db()
      .insert(materialUnits)
      .values({ materialId: serialized.id, serialNumber: serial, warehouseId: wh.id });

    const imported = await seedReadyImport([
      { line: 1, materialId: serialized.id, serial: 'placeholder' },
    ]);
    const row = await okJson<{ error?: string; unprocessable: boolean }>(
      await request(`/replenishments/imports/${imported.importId}/rows/1`, {
        method: 'PATCH',
        headers: jsonHeaders(officeToken),
        body: JSON.stringify({ serial }),
      }),
    );
    expect(row.error).toBe(RowErrorCode.SerialExists);
    // It promotes as a flagged item rather than blocking approval.
    expect(row.unprocessable).toBe(true);
  });

  test('a serial repeated inside the file flags the later line, not the first', async () => {
    const serialized = await newMaterial(MaterialTracking.Serialized, `RP-${tag().toUpperCase()}`);
    const serial = `SN-${tag()}`;
    const imported = await seedReadyImport([
      { line: 1, materialId: serialized.id, serial },
      { line: 2, materialId: serialized.id, serial: `SN-${tag()}` },
    ]);

    const later = await okJson<{ error?: string; unprocessable: boolean }>(
      await request(`/replenishments/imports/${imported.importId}/rows/2`, {
        method: 'PATCH',
        headers: jsonHeaders(officeToken),
        body: JSON.stringify({ serial }),
      }),
    );
    expect(later.error).toBe(RowErrorCode.DuplicateSerial);

    // Line 1 keeps it — first occurrence wins.
    const first = await okJson<{ error?: string }>(
      await request(`/replenishments/imports/${imported.importId}/rows/1`, {
        method: 'PATCH',
        headers: jsonHeaders(officeToken),
        body: JSON.stringify({ serial }),
      }),
    );
    expect(first.error).toBeUndefined();
  });

  test('rows are editable only while the import is ready or rejected', async () => {
    const imported = await seedImport();
    await stageRows(imported.importId, [{ line: 1, quantity: '1' }]);
    const patch = () =>
      request(`/replenishments/imports/${imported.importId}/rows/1`, {
        method: 'PATCH',
        headers: jsonHeaders(officeToken),
        body: JSON.stringify({ quantity: 2 }),
      });

    // Still `uploaded`.
    const early = await patch();
    expect(early.status).toBe(409);
    expect(await errorOf(early)).toBe('import_not_ready');

    await setStatus(imported.importId, ReplenishmentImportStatus.Ready);
    expect((await patch()).status).toBe(200);

    // `rejected` stays editable on purpose — that is what sending it back is for.
    await setStatus(imported.importId, ReplenishmentImportStatus.Rejected);
    expect((await patch()).status).toBe(200);
  });

  test('removing a line is owner/admin, needs a reason, and leaves its snapshot', async () => {
    const material = await newMaterial(MaterialTracking.Unserialized, `RP-${tag().toUpperCase()}`);
    const imported = await seedReadyImport([
      { line: 1, materialId: material.id, quantity: '8' },
    ]);
    const remove = (token: string, body: object) =>
      request(`/replenishments/imports/${imported.importId}/rows/1`, {
        method: 'DELETE',
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      });

    // Office prepares but may not remove (owner 2026-07-20).
    expect((await remove(officeToken, { reason: 'no llegó' })).status).toBe(403);
    expect((await remove(adminToken, {})).status).toBe(400);
    expect((await remove(adminToken, { reason: 'no llegó' })).status).toBe(200);

    const status = await okJson<{ rows?: unknown[] }>(
      await request(`/replenishments/imports/${imported.importId}`, {
        headers: jsonHeaders(ownerToken),
      }),
    );
    expect(status.rows).toBeUndefined();

    // The line is gone; the event is permanent and carries what it held.
    const audit = await okJson<{ items: { type: string; reason?: string; details: object }[] }>(
      await request(`/replenishments/imports/${imported.importId}/audit`, {
        headers: jsonHeaders(ownerToken),
      }),
    );
    const removed = audit.items.find((item) => item.type === ImportEventType.RowRemoved);
    expect(removed?.reason).toBe('no llegó');
    expect(removed?.details).toMatchObject({ quantity: '8', materialId: material.id });
  });
});

// ── prep + decisions ───────────────────────────────────────────────────────

describe('prep and the approval decision (02 §6)', () => {
  test('evidence and notes stage on the import, one event per changed field', async () => {
    const imported = await seedReadyImport();
    const res = await okJson<{ evidencePhotos: string[]; notes?: string }>(
      await request(`/replenishments/imports/${imported.importId}`, {
        method: 'PATCH',
        headers: jsonHeaders(officeToken),
        body: JSON.stringify({ evidencePhotos: ['wms-evidence/a.jpg'], notes: 'llegó completo' }),
      }),
    );
    expect(res.evidencePhotos).toEqual(['wms-evidence/a.jpg']);
    expect(res.notes).toBe('llegó completo');

    const audit = await okJson<{ items: { type: string }[] }>(
      await request(`/replenishments/imports/${imported.importId}/audit`, {
        headers: jsonHeaders(ownerToken),
      }),
    );
    const types = audit.items.map((item) => item.type);
    expect(types).toContain(ImportEventType.EvidenceUpdated);
    expect(types).toContain(ImportEventType.NotesUpdated);

    // A prep form submitted unchanged is a no-op, not a 500.
    const noop = await request(`/replenishments/imports/${imported.importId}`, {
      method: 'PATCH',
      headers: jsonHeaders(officeToken),
      body: JSON.stringify({}),
    });
    expect(noop.status).toBe(200);
  });

  test('an admin sends it back with a comment office can read', async () => {
    const imported = await seedReadyImport();
    const reject = (token: string, body: object) =>
      request(`/replenishments/imports/${imported.importId}/reject`, {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      });

    // The decision is not office's to make (§2.1e).
    expect((await reject(officeToken, { comment: 'faltan fotos' })).status).toBe(403);
    expect((await reject(adminToken, { comment: '  ' })).status).toBe(400);
    expect((await reject(adminToken, { comment: 'faltan fotos' })).status).toBe(200);

    const status = await okJson<{ status: string; rejectionComment?: string }>(
      await request(`/replenishments/imports/${imported.importId}`, {
        headers: jsonHeaders(officeToken),
      }),
    );
    expect(status.status).toBe(ReplenishmentImportStatus.Rejected);
    // Surfaced on the status read so office never has to open the timeline.
    expect(status.rejectionComment).toBe('faltan fotos');
  });

  test('office adjusts and re-requests approval', async () => {
    const imported = await seedReadyImport();
    const resubmit = () =>
      request(`/replenishments/imports/${imported.importId}/resubmit`, {
        method: 'POST',
        headers: jsonHeaders(officeToken),
      });

    // Nothing to resubmit while it is still awaiting a decision.
    const early = await resubmit();
    expect(early.status).toBe(409);
    expect(await errorOf(early)).toBe('import_not_rejected');

    await request(`/replenishments/imports/${imported.importId}/reject`, {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ comment: 'faltan fotos' }),
    });
    expect((await resubmit()).status).toBe(200);

    const status = await okJson<{ status: string }>(
      await request(`/replenishments/imports/${imported.importId}`, {
        headers: jsonHeaders(officeToken),
      }),
    );
    expect(status.status).toBe(ReplenishmentImportStatus.Ready);
  });

  test('discard is the benign abandon — any prep role, no reason', async () => {
    const imported = await seedImport();
    const res = await request(`/replenishments/imports/${imported.importId}/discard`, {
      method: 'POST',
      headers: jsonHeaders(officeToken),
    });
    expect(res.status).toBe(200);
    expect(await json<{ status: string }>(res)).toMatchObject({
      status: ReplenishmentImportStatus.Stale,
    });

    // Terminal: the slot is free, so the warehouse can import again.
    expect((await upload(ownerToken, imported.warehouseId)).status).toBe(201);
  });

  test('cancel is the owner’s alone, needs a reason, and truncates the staging', async () => {
    const material = await newMaterial(MaterialTracking.Unserialized, `RP-${tag().toUpperCase()}`);
    const imported = await seedReadyImport([
      { line: 1, materialId: material.id, quantity: '5' },
    ]);
    const cancel = (token: string, body: object) =>
      request(`/replenishments/imports/${imported.importId}/cancel`, {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify(body),
      });

    expect((await cancel(adminToken, { reason: 'error del proveedor' })).status).toBe(403);
    expect((await cancel(ownerToken, {})).status).toBe(400);
    expect((await cancel(ownerToken, { reason: 'error del proveedor' })).status).toBe(200);

    const status = await okJson<{ status: string; rows?: unknown[] }>(
      await request(`/replenishments/imports/${imported.importId}`, {
        headers: jsonHeaders(ownerToken),
      }),
    );
    expect(status.status).toBe(ReplenishmentImportStatus.Cancelled);
    expect(status.rows).toBeUndefined();

    // A closed record cannot be cancelled twice.
    const again = await cancel(ownerToken, { reason: 'otra vez' });
    expect(again.status).toBe(409);
    expect(await errorOf(again)).toBe('import_not_cancellable');
  });
});

// ── audit ──────────────────────────────────────────────────────────────────

describe('the lifecycle audit (02 §6)', () => {
  test('every step lands in the timeline, newest first, with its actor', async () => {
    const imported = await seedImport();
    await request(`/replenishments/imports/${imported.importId}/process`, {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ mapping: mappingFor(imported.fields) }),
    });
    await setStatus(imported.importId, ReplenishmentImportStatus.Ready);
    await request(`/replenishments/imports/${imported.importId}/reject`, {
      method: 'POST',
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ comment: 'revisar cantidades' }),
    });

    const audit = await okJson<{
      items: { type: string; actor?: { name: string }; reason?: string }[];
      total: number;
    }>(
      await request(`/replenishments/imports/${imported.importId}/audit?limit=100`, {
        headers: jsonHeaders(officeToken),
      }),
    );

    // Asserted over the events that HAVE an actor. A consumer is declared in
    // wrangler.toml, so miniflare really delivers the queued message and the
    // processor's system events (`processing_started`, `processed`) land in
    // this same timeline at a moment nothing here controls — sometimes before
    // this read, sometimes after. Those carry no actor by design, so filtering
    // on that is both the deterministic cut and the thing this test is about.
    const byHumans = audit.items.filter((item) => item.actor !== undefined);
    expect(byHumans.map((item) => item.type)).toEqual([
      ImportEventType.Rejected,
      ImportEventType.MappingSubmitted,
      ImportEventType.Created,
    ]);
    expect(byHumans[0]?.reason).toBe('revisar cantidades');
    expect(byHumans[0]?.actor?.name).toBeTruthy();

    const paged = await okJson<{ items: unknown[]; total: number }>(
      await request(`/replenishments/imports/${imported.importId}/audit?page=2&limit=2`, {
        headers: jsonHeaders(officeToken),
      }),
    );
    expect(paged.total).toBe(audit.total);
    expect(paged.items.length).toBeGreaterThan(0);
  });

  test('technicians reach none of this', async () => {
    const imported = await seedReadyImport();
    for (const path of ['', '/audit']) {
      const res = await request(`/replenishments/imports/${imported.importId}${path}`, {
        headers: jsonHeaders(techToken),
      });
      expect(res.status).toBe(403);
    }
  });
});
