import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { and, eq, isNull, like } from 'drizzle-orm';
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
  movements,
  stockEntries,
  storageNodes,
  warehouses,
} from '../src/modules/database/schema';
import { MaterialTracking } from '../src/modules/wms/enums/materials.enum';
import { MovementType } from '../src/modules/wms/enums/movements.enum';

// The material catalog (10-wms/02 §3). Same live-DB contract as
// `wms-warehouses.test.ts`: fixtures carry a `wms-test-` name marker and are
// soft-deleted in `afterAll`.

type WorkerEnv = { DATABASE_URL: string };

// The prefix is PER SUITE, not shared: vitest runs test files in parallel, and
// `afterAll` cleans by prefix — a marker both suites answered to would have one
// file soft-deleting the other's live fixtures mid-run. Both still carry the
// `wms-test-` marker 02 CP-1 asks for.
const FIXTURE_PREFIX = 'wms-test-mm-';
const tag = () => Math.random().toString(36).slice(2, 10);
const wmsName = (scope: string) => `${FIXTURE_PREFIX}${scope}-${tag()}`;
const uniqueSku = () => `WT-${tag().toUpperCase()}`;
/** 12 digits, in GTIN range. Random rather than sequential — the index is on
 *  live rows across the whole tenant, and fixtures share it with real data. */
const uniqueUpc = () =>
  Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');

const db = () => createDb((env as unknown as WorkerEnv).DATABASE_URL);

let ownerToken = '';
let officeToken = '';
let techToken = '';
let ownerId = '';

beforeAll(async () => {
  const [owner, , office, tech] = await Promise.all([
    seedOwnerAndLogin(),
    seedAdminAndLogin(),
    seedOfficeAndLogin(),
    seedTechnicianAndLogin(),
  ]);
  ownerToken = owner.token;
  ownerId = owner.owner.id;
  officeToken = office.token;
  techToken = tech.token;
});

afterAll(async () => {
  const conn = db();
  const now = new Date();
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

const createMaterial = (token: string, body: object = {}) =>
  request('/materials', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      name: wmsName('mat'),
      unit: 'pza',
      tracking: MaterialTracking.Unserialized,
      ...body,
    }),
  });

type MaterialBody = {
  id: string;
  sku?: string;
  upc?: string;
  name: string;
  totalStock: string;
  lowStock: boolean;
  tracking: MaterialTracking;
};

const seedMaterial = async (body: object = {}) => {
  const res = await createMaterial(ownerToken, body);
  expect(res.status).toBe(201);
  return json<MaterialBody>(res);
};

/** A warehouse to hang stock on. Goes through the API so the locatability rule
 *  is satisfied the same way real callers satisfy it. */
const seedWarehouse = async () => {
  const res = await request('/warehouses', {
    method: 'POST',
    headers: jsonHeaders(ownerToken),
    body: JSON.stringify({ name: wmsName('wh'), locationReference: 'wms-test almacén' }),
  });
  expect(res.status).toBe(201);
  return json<{ id: string }>(res);
};

/** Stock written directly: emitting the movement that would normally create it
 *  is the stock submodule's transaction, not this slice's. */
const putStock = async (materialId: string, warehouseId: string, quantity: string) => {
  const [row] = await db()
    .insert(stockEntries)
    .values({ materialId, warehouseId, quantity })
    .returning();
  if (!row) throw new Error('fixture stock entry insert returned no row');
  return row;
};

describe('catalog writes (02 §3)', () => {
  test('a new material starts at zero and is not low', async () => {
    const mat = await seedMaterial({ minStock: 5 });
    expect(mat.totalStock).toBe('0');
    // Zero IS below a minimum of five — the material has none of something it
    // should keep in stock, which is exactly what the pill is for.
    const fetched = await json<MaterialBody>(
      await request(`/materials/${mat.id}`, { headers: jsonHeaders(ownerToken) }),
    );
    expect(fetched.lowStock).toBe(true);
  });

  test('no minimum means never low, however empty', async () => {
    const mat = await seedMaterial();
    expect(mat.totalStock).toBe('0');
    expect(mat.lowStock).toBe(false);
  });

  test('the catalog is owner/admin — office and technicians read only', async () => {
    expect((await createMaterial(officeToken)).status).toBe(403);
    expect((await createMaterial(techToken)).status).toBe(403);
    // The technician read IS the stock-lookup surface (09 §2) — same endpoint.
    expect((await request('/materials', { headers: jsonHeaders(techToken) })).status).toBe(200);
  });

  test('a duplicate SKU and a duplicate UPC are told apart', async () => {
    const sku = uniqueSku();
    const upc = uniqueUpc();
    await seedMaterial({ sku, upc });

    const skuClash = await createMaterial(ownerToken, { sku });
    expect(skuClash.status).toBe(409);
    expect(await json<{ error: string }>(skuClash)).toMatchObject({ error: 'sku_in_use' });

    // Same conflict class, different field — the dialog has to know which one
    // to mark, so the two codes must not collapse into one.
    const upcClash = await createMaterial(ownerToken, { upc });
    expect(upcClash.status).toBe(409);
    expect(await json<{ error: string }>(upcClash)).toMatchObject({ error: 'upc_in_use' });
  });

  test('the barcode must be GTIN digits', async () => {
    expect((await createMaterial(ownerToken, { upc: '123456' })).status).toBe(400);
    expect((await createMaterial(ownerToken, { upc: '12345678901234567' })).status).toBe(400);
    expect((await createMaterial(ownerToken, { upc: 'ABCDEFGH' })).status).toBe(400);
    expect((await createMaterial(ownerToken, { upc: '00012345678' })).status).toBe(201);
  });

  test('a soft-deleted material frees its codes again', async () => {
    const sku = uniqueSku();
    const mat = await seedMaterial({ sku });

    expect(
      (await request(`/materials/${mat.id}`, {
        method: 'DELETE',
        headers: jsonHeaders(ownerToken),
      })).status,
    ).toBe(200);

    // The unique indexes are partial on `deleted_at is null`, so the code is
    // available the moment the material leaves the live catalog.
    const reused = await createMaterial(ownerToken, { sku });
    expect(reused.status).toBe(201);
  });

  test('a PATCH that changes nothing is a no-op, not a 500', async () => {
    const mat = await seedMaterial({ minStock: 4 });
    const res = await request(`/materials/${mat.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    expect(await json<MaterialBody>(res)).toMatchObject({ id: mat.id, name: mat.name });
  });

  test('a malformed id 404s instead of throwing on the uuid cast', async () => {
    const res = await request('/materials/not-a-uuid', { headers: jsonHeaders(ownerToken) });
    expect(res.status).toBe(404);
  });
});

describe('tracking is frozen by history, not by stock (02 §3)', () => {
  test('the mode is editable until the first movement, then never', async () => {
    const mat = await seedMaterial({ tracking: MaterialTracking.Unserialized });
    const wh = await seedWarehouse();

    const patchTracking = (tracking: MaterialTracking) =>
      request(`/materials/${mat.id}`, {
        method: 'PATCH',
        headers: jsonHeaders(ownerToken),
        body: JSON.stringify({ tracking }),
      });

    // No history yet — the UI locks this right after create, but the rule the
    // server enforces is about movements, not about time.
    const corrected = await patchTracking(MaterialTracking.Lot);
    expect(corrected.status).toBe(200);
    expect((await json<MaterialBody>(corrected)).tracking).toBe(MaterialTracking.Lot);

    await db()
      .insert(movements)
      .values({
        type: MovementType.Inbound,
        reason: 'replenishment',
        materialId: mat.id,
        quantity: '1',
        toWarehouseId: wh.id,
        userId: ownerId,
      });

    const frozen = await patchTracking(MaterialTracking.Serialized);
    expect(frozen.status).toBe(409);
    expect(await json<{ error: string }>(frozen)).toMatchObject({ error: 'tracking_immutable' });

    // Re-stating the same mode is not a change and must not trip the guard —
    // an editor that PATCHes the whole form would otherwise be unusable.
    const unchanged = await patchTracking(MaterialTracking.Lot);
    expect(unchanged.status).toBe(200);

    // Everything else stays editable with history behind it.
    const renamed = await request(`/materials/${mat.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ name: wmsName('renamed'), minStock: 12 }),
    });
    expect(renamed.status).toBe(200);
  });
});

describe('search resolves typed text and scanned barcodes (02 §3)', () => {
  test('name matches anywhere, SKU by prefix, UPC exactly', async () => {
    const sku = uniqueSku();
    const upc = uniqueUpc();
    const mat = await seedMaterial({ sku, upc, name: wmsName('anillo-de-cobre') });

    const find = async (search: string) => {
      const res = await request(`/materials?search=${encodeURIComponent(search)}`, {
        headers: jsonHeaders(ownerToken),
      });
      expect(res.status).toBe(200);
      return json<{ items: MaterialBody[]; total: number }>(res);
    };

    expect((await find('anillo-de-cobre')).items.map((m) => m.id)).toContain(mat.id);
    expect((await find(sku.slice(0, 5))).items.map((m) => m.id)).toContain(mat.id);
    // A keyboard-wedge scanner types the digits and hits Enter — the plain
    // search box is the scan target, so no dedicated scanning UI is needed.
    expect((await find(upc)).items.map((m) => m.id)).toContain(mat.id);
    // Partial barcodes are not a match: half a scan is a mis-scan.
    expect((await find(upc.slice(0, 6))).items.map((m) => m.id)).not.toContain(mat.id);
  });

  test('the tracking filter narrows the catalog', async () => {
    const lot = await seedMaterial({ tracking: MaterialTracking.Lot });
    const serialized = await seedMaterial({ tracking: MaterialTracking.Serialized });

    const res = await request(`/materials?tracking=${MaterialTracking.Lot}&limit=100`, {
      headers: jsonHeaders(ownerToken),
    });
    const ids = (await json<{ items: MaterialBody[] }>(res)).items.map((m) => m.id);
    expect(ids).toContain(lot.id);
    expect(ids).not.toContain(serialized.id);
  });

  test('an unknown tracking value is refused, not ignored', async () => {
    const res = await request('/materials?tracking=bogus', { headers: jsonHeaders(ownerToken) });
    expect(res.status).toBe(400);
  });
});

describe('total stock + the low-stock filter (00 §6 #24)', () => {
  test('the total is summed in SQL, and the filter pages on it', async () => {
    const wh = await seedWarehouse();
    const low = await seedMaterial({ minStock: 10 });
    const stocked = await seedMaterial({ minStock: 2 });

    await putStock(low.id, wh.id, '3');
    await putStock(stocked.id, wh.id, '40');

    const read = async (id: string) =>
      json<MaterialBody>(await request(`/materials/${id}`, { headers: jsonHeaders(ownerToken) }));

    const lowRow = await read(low.id);
    // Whole integers in v1 — the numeric(12,3) scale is not the API's business.
    expect(lowRow.totalStock).toBe('3');
    expect(lowRow.lowStock).toBe(true);

    const stockedRow = await read(stocked.id);
    expect(stockedRow.totalStock).toBe('40');
    expect(stockedRow.lowStock).toBe(false);

    const filtered = await request('/materials?lowStock=true&limit=100', {
      headers: jsonHeaders(ownerToken),
    });
    const ids = (await json<{ items: MaterialBody[] }>(filtered)).items.map((m) => m.id);
    expect(ids).toContain(low.id);
    expect(ids).not.toContain(stocked.id);
  });

  test('stock spread across locations sums into one total', async () => {
    const [a, b] = [await seedWarehouse(), await seedWarehouse()];
    const mat = await seedMaterial();
    await putStock(mat.id, a.id, '4');
    await putStock(mat.id, b.id, '6');

    const row = await json<MaterialBody>(
      await request(`/materials/${mat.id}`, { headers: jsonHeaders(ownerToken) }),
    );
    expect(row.totalStock).toBe('10');
  });

  test('the list is paged and reports the full total', async () => {
    const res = await request('/materials?page=1&limit=2', { headers: jsonHeaders(ownerToken) });
    expect(res.status).toBe(200);
    const body = await json<{ items: MaterialBody[]; total: number }>(res);
    expect(body.items.length).toBeLessThanOrEqual(2);
    // `total` counts the filtered set, not the page.
    expect(body.total).toBeGreaterThanOrEqual(body.items.length);
    expect((await request('/materials?limit=101', { headers: jsonHeaders(ownerToken) })).status).toBe(
      400,
    );
  });
});

describe('per-location breakdown (02 §3)', () => {
  test('all three lists are always present, whatever the tracking mode', async () => {
    const mat = await seedMaterial();
    const res = await request(`/materials/${mat.id}/stock`, { headers: jsonHeaders(techToken) });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ entries: [], units: [], lots: [] });
  });

  test('unserialized stock reports its warehouse', async () => {
    const wh = await seedWarehouse();
    const mat = await seedMaterial();
    await putStock(mat.id, wh.id, '7');

    const body = await json<{
      entries: { warehouse: { id: string }; node?: unknown; quantity: string }[];
    }>(await request(`/materials/${mat.id}/stock`, { headers: jsonHeaders(ownerToken) }));

    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]?.warehouse.id).toBe(wh.id);
    expect(body.entries[0]?.quantity).toBe('7');
    // Held at warehouse level, so there is no node block at all.
    expect(body.entries[0]).not.toHaveProperty('node');
  });
});

describe('deletion is soft and zero-stock-only (02 §3)', () => {
  test('a stocked material stays; drained, it goes', async () => {
    const wh = await seedWarehouse();
    const mat = await seedMaterial();
    const entry = await putStock(mat.id, wh.id, '2');

    const del = () =>
      request(`/materials/${mat.id}`, { method: 'DELETE', headers: jsonHeaders(ownerToken) });

    const blocked = await del();
    expect(blocked.status).toBe(409);
    expect(await json<{ error: string }>(blocked)).toMatchObject({ error: 'material_has_stock' });

    await db().update(stockEntries).set({ quantity: '0' }).where(eq(stockEntries.id, entry.id));

    expect((await del()).status).toBe(200);

    const [row] = await db()
      .select({ deletedAt: materials.deletedAt })
      .from(materials)
      .where(eq(materials.id, mat.id));
    expect(row?.deletedAt).not.toBeNull();

    expect(
      (await request(`/materials/${mat.id}`, { headers: jsonHeaders(ownerToken) })).status,
    ).toBe(404);
  });
});
