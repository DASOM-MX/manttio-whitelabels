import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { and, eq, isNull, like } from 'drizzle-orm';
import { env, json, jsonHeaders, request } from './helpers/request';
import {
  seedAdminAndLogin,
  seedCustomer,
  seedOfficeAndLogin,
  seedOwnerAndLogin,
  seedReport,
  seedTechnicianAndLogin,
} from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import {
  materials,
  materialUnits,
  movements,
  stockEntries,
  storageNodes,
  warehouses,
} from '../src/modules/database/schema';
import { AssignmentRole } from '../src/modules/wms/enums/assignments.enum';
import { MaterialTracking, MaterialUnitStatus } from '../src/modules/wms/enums/materials.enum';
import {
  MovementType,
  ReadjustmentDirection,
  ReasonContext,
} from '../src/modules/wms/enums/movements.enum';
import { StorageNodeType } from '../src/modules/wms/enums/storage-nodes.enum';
import { MOVEMENT_REASON_SEEDS } from '../src/modules/wms/constants/movement-reason-seeds';
import { WMS_SETTING_DEFAULTS } from '../src/modules/wms/constants/wms-setting-keys';
import { getSetting, setSetting } from '../src/modules/wms/services/wms-settings.service';

// Stock operations, movement reasons and the settings store (10-wms/02 §4/§5,
// CP-2). Live-DB contract as everywhere else in this suite — except for one
// thing worth stating out loud: **the `movements` rows these tests write are
// permanent**. The journal is append-only by design (01 §2), so `afterAll`
// soft-deletes the warehouses and materials the tests hang off and leaves their
// history behind, exactly as production does.

type WorkerEnv = { DATABASE_URL: string };

// Per suite, not shared: vitest runs test files in parallel and `afterAll`
// cleans by prefix, so a marker two files answered to would have one of them
// soft-deleting the other's live fixtures mid-run.
const FIXTURE_PREFIX = 'wms-test-st-';
const tag = () => Math.random().toString(36).slice(2, 10);
const wmsName = (scope: string) => `${FIXTURE_PREFIX}${scope}-${tag()}`;

const db = () => createDb((env as unknown as WorkerEnv).DATABASE_URL);

let ownerToken = '';
let adminToken = '';
let officeToken = '';
let techToken = '';
let tech2Token = '';

/** Fails with the server's own body instead of a bare status mismatch — a 500
 *  from a transaction is unreadable otherwise. */
const okJson = async <T>(res: Response, status = 200): Promise<T> => {
  if (res.status !== status) {
    throw new Error(`expected ${status}, got ${res.status}: ${await res.text()}`);
  }
  return json<T>(res);
};

const errorOf = async (res: Response) => (await json<{ error: string }>(res)).error;

// ── fixture builders ───────────────────────────────────────────────────────

type WarehouseBody = { id: string; name: string };
type MaterialBody = { id: string; tracking: MaterialTracking; totalStock: string };
type NodeBody = { id: string };

const newWarehouse = async (scope = 'wh'): Promise<WarehouseBody> =>
  okJson<WarehouseBody>(
    await request('/warehouses', {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ name: wmsName(scope), locationReference: 'wms-test' }),
    }),
    201,
  );

const newNode = async (warehouseId: string): Promise<NodeBody> =>
  okJson<NodeBody>(
    await request(`/warehouses/${warehouseId}/nodes`, {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ type: StorageNodeType.Rack, name: wmsName('rack') }),
    }),
    201,
  );

const newMaterial = async (tracking: MaterialTracking): Promise<MaterialBody> =>
  okJson<MaterialBody>(
    await request('/materials', {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ name: wmsName('mat'), unit: 'pza', tracking }),
    }),
    201,
  );

const assignVan = async (warehouseId: string, userId: string) =>
  request(`/warehouses/${warehouseId}/assign-technician`, {
    method: 'POST',
    headers: jsonHeaders(ownerToken),
    body: JSON.stringify({ userId, role: AssignmentRole.Technician }),
  });

/** A technician holds ONE van at a time (01 §2), so every test that needs an
 *  assigned one seeds its own rather than sharing the suite's technician —
 *  otherwise the second assignment answers `409 technician_already_assigned`
 *  and the test silently runs against the first test's van. */
const newTechWithVan = async (scope = 'van') => {
  const tech = await seedTechnicianAndLogin();
  const van = await newWarehouse(scope);
  const res = await assignVan(van.id, tech.tech.id);
  if (res.status !== 200) {
    throw new Error(`assignVan failed: ${res.status} ${await res.text()}`);
  }
  return { token: tech.token, id: tech.tech.id, van };
};

type MovementBody = {
  id: string;
  type: MovementType;
  direction?: ReadjustmentDirection;
  reason: { code: string; label: string };
  quantity?: string;
  pieces?: number;
  lotNumber?: string;
  units: { id: string; serialNumber: string }[];
  from?: { warehouse: { id: string }; node?: { id: string } };
  to?: { warehouse: { id: string }; node?: { id: string } };
  notes?: string;
};

const post = (path: string, token: string, body: object, key?: string) =>
  request(path, {
    method: 'POST',
    headers: key ? { ...jsonHeaders(token), 'Idempotency-Key': key } : jsonHeaders(token),
    body: JSON.stringify(body),
  });

const stockAt = async (warehouseId: string, token = ownerToken) =>
  okJson<{
    entries: { material: { id: string }; quantity: string }[];
    units: { id: string; serialNumber: string }[];
    lots: { lotNumber: string; quantity: string; pieces: number; expiresAt?: string }[];
  }>(await request(`/warehouses/${warehouseId}/stock`, { headers: jsonHeaders(token) }));

const quantityOf = async (warehouseId: string, materialId: string) => {
  const stock = await stockAt(warehouseId);
  return stock.entries.find((e) => e.material.id === materialId)?.quantity ?? '0';
};

beforeAll(async () => {
  const [owner, admin, office, tech, tech2] = await Promise.all([
    seedOwnerAndLogin(),
    seedAdminAndLogin(),
    seedOfficeAndLogin(),
    seedTechnicianAndLogin(),
    seedTechnicianAndLogin(),
  ]);
  ownerToken = owner.token;
  adminToken = admin.token;
  officeToken = office.token;
  techToken = tech.token;
  tech2Token = tech2.token;
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

// ── §5 movement reasons ────────────────────────────────────────────────────

type ReasonBody = {
  id: string;
  code: string;
  label: string;
  builtIn: boolean;
  appliesTo: ReasonContext[];
  requiresNote: boolean;
  active: boolean;
};

const listReasons = async (token = ownerToken) =>
  (await okJson<{ reasons: ReasonBody[] }>(
    await request('/movement-reasons', { headers: jsonHeaders(token) }),
  )).reasons;

describe('movement reasons (02 §5)', () => {
  test('the 14 built-ins are seeded and readable by every role', async () => {
    const reasons = await listReasons(techToken);
    const builtIns = reasons.filter((r) => r.builtIn);
    // The seed constant is the TS mirror of the migration INSERT; the API is
    // the third view of the same 14 rows, and all three have to agree.
    expect(builtIns.map((r) => r.code).sort()).toEqual(
      MOVEMENT_REASON_SEEDS.map((s) => s.code).sort(),
    );
    const scrap = builtIns.find((r) => r.code === 'scrap');
    expect(scrap?.requiresNote).toBe(true);
    expect(scrap?.active).toBe(true);
  });

  test('a custom reason gets a server-slugged code, collision-suffixed', async () => {
    const label = `Reparación en sitio ${tag()}`;
    const first = await okJson<ReasonBody>(
      await post('/movement-reasons', ownerToken, {
        label,
        appliesTo: [ReasonContext.Inbound],
      }),
      201,
    );
    // Accents fold and punctuation collapses — the code has to match the
    // snake_case built-ins because it is what the journal stores forever.
    expect(first.code).toMatch(/^reparacion_en_sitio_[a-z0-9]+$/);
    expect(first.builtIn).toBe(false);

    const second = await okJson<ReasonBody>(
      await post('/movement-reasons', ownerToken, {
        label,
        appliesTo: [ReasonContext.Inbound],
      }),
      201,
    );
    expect(second.code).toBe(`${first.code}-2`);
  });

  test('consumption is never offerable — it belongs to report_binding', async () => {
    const res = await post('/movement-reasons', ownerToken, {
      label: `Consumo ${tag()}`,
      appliesTo: [ReasonContext.Consumption],
    });
    expect(res.status).toBe(400);
  });

  test('reasons are owner/admin to write, everyone to read', async () => {
    const body = { label: `Motivo ${tag()}`, appliesTo: [ReasonContext.Transfer] };
    expect((await post('/movement-reasons', officeToken, body)).status).toBe(403);
    expect((await post('/movement-reasons', techToken, body)).status).toBe(403);
    expect((await request('/movement-reasons', { headers: jsonHeaders(officeToken) })).status).toBe(
      200,
    );
  });

  test('built-ins are locked; custom reasons take a label edit and a retirement', async () => {
    const builtIn = (await listReasons()).find((r) => r.code === 'relocation');
    const locked = await request(`/movement-reasons/${builtIn?.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ label: 'Otra cosa' }),
    });
    expect(locked.status).toBe(403);
    expect(await errorOf(locked)).toBe('builtin_locked');

    const custom = await okJson<ReasonBody>(
      await post('/movement-reasons', ownerToken, {
        label: `Motivo ${tag()}`,
        appliesTo: [ReasonContext.Transfer],
      }),
      201,
    );
    const renamed = await okJson<ReasonBody>(
      await request(`/movement-reasons/${custom.id}`, {
        method: 'PATCH',
        headers: jsonHeaders(ownerToken),
        body: JSON.stringify({ label: 'Renombrado', active: false }),
      }),
    );
    expect(renamed.label).toBe('Renombrado');
    expect(renamed.active).toBe(false);
    // The code never moves: `movements.reason` FKs it.
    expect(renamed.code).toBe(custom.code);
  });

  test('a PATCH that changes nothing is a no-op, not a 500', async () => {
    const custom = await okJson<ReasonBody>(
      await post('/movement-reasons', ownerToken, {
        label: `Motivo ${tag()}`,
        appliesTo: [ReasonContext.Transfer],
      }),
      201,
    );
    const res = await request(`/movement-reasons/${custom.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
  });

  test('there is no delete route — retirement is `active: false`', async () => {
    const custom = (await listReasons()).find((r) => !r.builtIn);
    const res = await request(`/movement-reasons/${custom?.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(ownerToken),
    });
    expect(res.status).toBe(404);
  });
});

// ── §4 inbound ─────────────────────────────────────────────────────────────

describe('inbound (02 §4)', () => {
  test('an unserialized receipt books the balance and journals it', async () => {
    const wh = await newWarehouse();
    const node = await newNode(wh.id);
    const mat = await newMaterial(MaterialTracking.Unserialized);

    const movement = await okJson<MovementBody>(
      await post('/stock/inbound', ownerToken, {
        materialId: mat.id,
        to: { warehouseId: wh.id, storageNodeId: node.id },
        quantity: 12,
        reason: 'refund_by_client',
      }),
      201,
    );
    expect(movement.type).toBe(MovementType.Inbound);
    // Quantities read back as plain integers, never `12.000`.
    expect(movement.quantity).toBe('12');
    expect(movement.to?.warehouse.id).toBe(wh.id);
    expect(movement.to?.node?.id).toBe(node.id);
    expect(movement.from).toBeUndefined();

    expect(await quantityOf(wh.id, mat.id)).toBe('12');

    // A second receipt at the same location adds, it does not replace.
    await okJson<MovementBody>(
      await post('/stock/inbound', ownerToken, {
        materialId: mat.id,
        to: { warehouseId: wh.id, storageNodeId: node.id },
        quantity: 3,
        reason: 'refund_by_client',
      }),
      201,
    );
    expect(await quantityOf(wh.id, mat.id)).toBe('15');
  });

  test('a serialized receipt creates the units and claims their serials', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Serialized);
    const serial = `SN-${tag()}`;

    const movement = await okJson<MovementBody>(
      await post('/stock/inbound', ownerToken, {
        materialId: mat.id,
        to: { warehouseId: wh.id },
        serials: [serial, `SN-${tag()}`],
        reason: 'refund_by_client',
      }),
      201,
    );
    // Serialized movements carry no quantity — `movement_units` is the detail.
    expect(movement.quantity).toBeUndefined();
    expect(movement.units).toHaveLength(2);

    const stock = await stockAt(wh.id);
    expect(stock.units.map((u) => u.serialNumber)).toContain(serial);

    const clash = await post('/stock/inbound', ownerToken, {
      materialId: mat.id,
      to: { warehouseId: wh.id },
      serials: [serial],
      reason: 'refund_by_client',
    });
    expect(clash.status).toBe(409);
    expect(await errorOf(clash)).toBe('serial_exists');
  });

  test('a lot receipt tops up, and the first expiry is the one that sticks', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Lot);
    const lotNumber = `L-${tag()}`;

    await okJson<MovementBody>(
      await post('/stock/inbound', ownerToken, {
        materialId: mat.id,
        to: { warehouseId: wh.id },
        lotNumber,
        quantity: 5000,
        pieces: 10,
        expiresAt: '2030-01-01T00:00:00.000Z',
        reason: 'refund_by_client',
      }),
      201,
    );

    // A repeat lot number is a TOP-UP, not an error (01 §2) — and the second
    // receipt's date is ignored, because the expiry is a property of the LOT.
    await okJson<MovementBody>(
      await post('/stock/inbound', ownerToken, {
        materialId: mat.id,
        to: { warehouseId: wh.id },
        lotNumber,
        quantity: 500,
        pieces: 1,
        expiresAt: '2031-06-06T00:00:00.000Z',
        reason: 'refund_by_client',
      }),
      201,
    );

    const lot = (await stockAt(wh.id)).lots.find((l) => l.lotNumber === lotNumber);
    expect(lot?.quantity).toBe('5500');
    expect(lot?.pieces).toBe(11);
    expect(lot?.expiresAt?.slice(0, 10)).toBe('2030-01-01');
  });

  test('the payload has to match the material tracking mode', async () => {
    const wh = await newWarehouse();
    const serialized = await newMaterial(MaterialTracking.Serialized);
    const unserialized = await newMaterial(MaterialTracking.Unserialized);

    const asQuantity = await post('/stock/inbound', ownerToken, {
      materialId: serialized.id,
      to: { warehouseId: wh.id },
      quantity: 4,
      reason: 'refund_by_client',
    });
    expect(asQuantity.status).toBe(400);
    expect(await errorOf(asQuantity)).toBe('tracking_mismatch');

    const asSerials = await post('/stock/inbound', ownerToken, {
      materialId: unserialized.id,
      to: { warehouseId: wh.id },
      serials: [`SN-${tag()}`],
      reason: 'refund_by_client',
    });
    expect(asSerials.status).toBe(400);
    expect(await errorOf(asSerials)).toBe('tracking_mismatch');
  });

  test('the reason has to apply to the movement, and has to be live', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Unserialized);
    const body = {
      materialId: mat.id,
      to: { warehouseId: wh.id },
      quantity: 1,
    };

    // `relocation` is transfer-only.
    const wrongContext = await post('/stock/inbound', ownerToken, {
      ...body,
      reason: 'relocation',
    });
    expect(wrongContext.status).toBe(400);
    expect(await errorOf(wrongContext)).toBe('invalid_reason_context');

    // An unknown code answers the same way: a reason that applies to nothing is
    // exactly a reason that does not apply here.
    const unknown = await post('/stock/inbound', ownerToken, {
      ...body,
      reason: `no-such-${tag()}`,
    });
    expect(unknown.status).toBe(400);
    expect(await errorOf(unknown)).toBe('invalid_reason_context');

    const retired = await okJson<ReasonBody>(
      await post('/movement-reasons', ownerToken, {
        label: `Motivo ${tag()}`,
        appliesTo: [ReasonContext.Inbound],
      }),
      201,
    );
    await request(`/movement-reasons/${retired.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ active: false }),
    });
    const inactive = await post('/stock/inbound', ownerToken, {
      ...body,
      reason: retired.code,
    });
    expect(inactive.status).toBe(400);
    expect(await errorOf(inactive)).toBe('reason_inactive');
  });

  test('a blank note is no note (00 §6 #23)', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Unserialized);
    await okJson<MovementBody>(
      await post('/stock/inbound', ownerToken, {
        materialId: mat.id,
        to: { warehouseId: wh.id },
        quantity: 10,
        reason: 'refund_by_client',
      }),
      201,
    );

    // `scrap` is seeded `requiresNote` — and it is a readjust-out reason, so
    // the note rule is tested where it actually applies.
    const noNote = await post('/stock/readjust', ownerToken, {
      direction: ReadjustmentDirection.Out,
      materialId: mat.id,
      at: { warehouseId: wh.id },
      quantity: 1,
      reason: 'scrap',
      notes: '   ',
    });
    // A whitespace-only note never reaches the service: the validator trims.
    expect(noNote.status).toBe(400);
  });

  test('ad-hoc replenishment is admin-only; office is sent to the document flow', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Unserialized);
    const body = {
      materialId: mat.id,
      to: { warehouseId: wh.id },
      quantity: 2,
      reason: 'replenishment',
    };

    expect((await post('/stock/inbound', adminToken, body)).status).toBe(201);

    const asOffice = await post('/stock/inbound', officeToken, body);
    expect(asOffice.status).toBe(400);
    expect(await errorOf(asOffice)).toBe('use_replenishment_flow');
  });

  test('the node must belong to the warehouse it is posted under', async () => {
    const [a, b] = await Promise.all([newWarehouse(), newWarehouse()]);
    const node = await newNode(b.id);
    const mat = await newMaterial(MaterialTracking.Unserialized);

    const res = await post('/stock/inbound', ownerToken, {
      materialId: mat.id,
      to: { warehouseId: a.id, storageNodeId: node.id },
      quantity: 1,
      reason: 'refund_by_client',
    });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe('node_warehouse_mismatch');
  });

  test('receiving is back-office work — technicians cannot', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Unserialized);
    const res = await post('/stock/inbound', techToken, {
      materialId: mat.id,
      to: { warehouseId: wh.id },
      quantity: 1,
      reason: 'refund_by_client',
    });
    expect(res.status).toBe(403);
  });
});

// ── §4 transfer ────────────────────────────────────────────────────────────

describe('transfer (02 §4)', () => {
  test('a transfer moves the balance from one location to the other', async () => {
    const [a, b] = await Promise.all([newWarehouse(), newWarehouse()]);
    const mat = await newMaterial(MaterialTracking.Unserialized);
    await post('/stock/inbound', ownerToken, {
      materialId: mat.id,
      to: { warehouseId: a.id },
      quantity: 10,
      reason: 'refund_by_client',
    });

    const movement = await okJson<MovementBody>(
      await post('/stock/transfer', ownerToken, {
        materialId: mat.id,
        from: { warehouseId: a.id },
        to: { warehouseId: b.id },
        quantity: 4,
        reason: 'relocation',
      }),
      201,
    );
    expect(movement.type).toBe(MovementType.Transfer);
    expect(movement.from?.warehouse.id).toBe(a.id);
    expect(movement.to?.warehouse.id).toBe(b.id);

    expect(await quantityOf(a.id, mat.id)).toBe('6');
    expect(await quantityOf(b.id, mat.id)).toBe('4');
  });

  test('a source that does not hold enough is refused, not overdrawn', async () => {
    const [a, b] = await Promise.all([newWarehouse(), newWarehouse()]);
    const mat = await newMaterial(MaterialTracking.Unserialized);
    await post('/stock/inbound', ownerToken, {
      materialId: mat.id,
      to: { warehouseId: a.id },
      quantity: 2,
      reason: 'refund_by_client',
    });

    const res = await post('/stock/transfer', ownerToken, {
      materialId: mat.id,
      from: { warehouseId: a.id },
      to: { warehouseId: b.id },
      quantity: 5,
      reason: 'relocation',
    });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toBe('insufficient_stock');
    // The refusal is total — no partial move, no negative balance.
    expect(await quantityOf(a.id, mat.id)).toBe('2');
  });

  test('lot transfers move both dimensions and carry the expiry along', async () => {
    const [a, b] = await Promise.all([newWarehouse(), newWarehouse()]);
    const mat = await newMaterial(MaterialTracking.Lot);
    const lotNumber = `L-${tag()}`;
    await post('/stock/inbound', ownerToken, {
      materialId: mat.id,
      to: { warehouseId: a.id },
      lotNumber,
      quantity: 1000,
      pieces: 4,
      expiresAt: '2029-03-03T00:00:00.000Z',
      reason: 'refund_by_client',
    });

    await okJson<MovementBody>(
      await post('/stock/transfer', ownerToken, {
        materialId: mat.id,
        from: { warehouseId: a.id },
        to: { warehouseId: b.id },
        lotNumber,
        quantity: 250,
        pieces: 1,
        reason: 'relocation',
      }),
      201,
    );

    const source = (await stockAt(a.id)).lots.find((l) => l.lotNumber === lotNumber);
    const dest = (await stockAt(b.id)).lots.find((l) => l.lotNumber === lotNumber);
    expect(source?.quantity).toBe('750');
    expect(source?.pieces).toBe(3);
    expect(dest?.quantity).toBe('250');
    expect(dest?.pieces).toBe(1);
    // A split lot is still one lot: the destination inherits the source's date.
    expect(dest?.expiresAt?.slice(0, 10)).toBe('2029-03-03');

    // Packages are their own balance — three bags cannot leave a shelf holding
    // three when four are asked for.
    const tooManyPieces = await post('/stock/transfer', ownerToken, {
      materialId: mat.id,
      from: { warehouseId: a.id },
      to: { warehouseId: b.id },
      lotNumber,
      quantity: 10,
      pieces: 9,
      reason: 'relocation',
    });
    expect(tooManyPieces.status).toBe(409);
    expect(await errorOf(tooManyPieces)).toBe('insufficient_stock');
  });

  test('serialized transfers move the named units and refuse the unavailable', async () => {
    const [a, b] = await Promise.all([newWarehouse(), newWarehouse()]);
    const mat = await newMaterial(MaterialTracking.Serialized);
    const received = await okJson<MovementBody>(
      await post('/stock/inbound', ownerToken, {
        materialId: mat.id,
        to: { warehouseId: a.id },
        serials: [`SN-${tag()}`, `SN-${tag()}`],
        reason: 'refund_by_client',
      }),
      201,
    );
    const [first, second] = received.units;

    await okJson<MovementBody>(
      await post('/stock/transfer', ownerToken, {
        materialId: mat.id,
        from: { warehouseId: a.id },
        to: { warehouseId: b.id },
        materialUnitIds: [first!.id],
        reason: 'relocation',
      }),
      201,
    );
    expect((await stockAt(b.id)).units.map((u) => u.id)).toContain(first!.id);
    expect((await stockAt(a.id)).units.map((u) => u.id)).toEqual([second!.id]);

    // Already moved: it is no longer at the source.
    const stale = await post('/stock/transfer', ownerToken, {
      materialId: mat.id,
      from: { warehouseId: a.id },
      to: { warehouseId: b.id },
      materialUnitIds: [first!.id],
      reason: 'relocation',
    });
    expect(stale.status).toBe(409);
    expect(await errorOf(stale)).toBe('unit_not_available');
  });

  test('a transfer to the same location is rejected, not journaled', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Unserialized);
    await post('/stock/inbound', ownerToken, {
      materialId: mat.id,
      to: { warehouseId: wh.id },
      quantity: 5,
      reason: 'refund_by_client',
    });

    const res = await post('/stock/transfer', ownerToken, {
      materialId: mat.id,
      from: { warehouseId: wh.id },
      to: { warehouseId: wh.id },
      quantity: 1,
      reason: 'relocation',
    });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe('same_location');
  });
});

// ── §4 self-checkout ───────────────────────────────────────────────────────

describe('technician self-checkout (02 §4)', () => {
  test('all three constraints hold, and the happy path loads the van', async () => {
    const shop = await newWarehouse('shop');
    const me = await newTechWithVan('van');
    const colleague = await newTechWithVan('van2');
    const van = me.van;
    const otherVan = colleague.van;

    const mat = await newMaterial(MaterialTracking.Unserialized);
    await post('/stock/inbound', ownerToken, {
      materialId: mat.id,
      to: { warehouseId: shop.id },
      quantity: 20,
      reason: 'refund_by_client',
    });
    await post('/stock/inbound', ownerToken, {
      materialId: mat.id,
      to: { warehouseId: otherVan.id },
      quantity: 5,
      reason: 'refund_by_client',
    });

    // 1. Destination must be their own van.
    const wrongDestination = await post('/stock/transfer', me.token, {
      materialId: mat.id,
      from: { warehouseId: shop.id },
      to: { warehouseId: otherVan.id },
      quantity: 1,
      reason: 'relocation',
    });
    expect(wrongDestination.status).toBe(403);
    expect(await errorOf(wrongDestination)).toBe('not_own_van');

    // 2. Source may not be a colleague's van.
    const wrongSource = await post('/stock/transfer', me.token, {
      materialId: mat.id,
      from: { warehouseId: otherVan.id },
      to: { warehouseId: van.id },
      quantity: 1,
      reason: 'relocation',
    });
    expect(wrongSource.status).toBe(403);
    expect(await errorOf(wrongSource)).toBe('source_forbidden');

    // 3. The reason is forced.
    const wrongReason = await post('/stock/transfer', me.token, {
      materialId: mat.id,
      from: { warehouseId: shop.id },
      to: { warehouseId: van.id },
      quantity: 1,
      reason: 'repair',
    });
    expect(wrongReason.status).toBe(400);
    expect(await errorOf(wrongReason)).toBe('invalid_reason_context');

    const loaded = await okJson<MovementBody>(
      await post('/stock/transfer', me.token, {
        materialId: mat.id,
        from: { warehouseId: shop.id },
        to: { warehouseId: van.id },
        quantity: 3,
        reason: 'relocation',
      }),
      201,
    );
    expect(loaded.to?.warehouse.id).toBe(van.id);
    expect(await quantityOf(van.id, mat.id)).toBe('3');
  });

  test('a technician with no van has nowhere to check out to', async () => {
    const [shop, elsewhere] = await Promise.all([newWarehouse('shop'), newWarehouse('shop')]);
    const mat = await newMaterial(MaterialTracking.Unserialized);
    await post('/stock/inbound', ownerToken, {
      materialId: mat.id,
      to: { warehouseId: shop.id },
      quantity: 4,
      reason: 'refund_by_client',
    });

    const stranger = await seedTechnicianAndLogin();
    const res = await post('/stock/transfer', stranger.token, {
      materialId: mat.id,
      from: { warehouseId: shop.id },
      to: { warehouseId: elsewhere.id },
      quantity: 1,
      reason: 'relocation',
    });
    // A 409, not a 403: nothing is forbidden here, the tenant simply has not
    // given this technician a van yet.
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toBe('no_assigned_warehouse');
  });
});

// ── §4 readjust ────────────────────────────────────────────────────────────

describe('readjust (02 §4)', () => {
  test('it is owner/admin only — office sees adjustments but never makes one', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Unserialized);
    const res = await post('/stock/readjust', officeToken, {
      direction: ReadjustmentDirection.In,
      materialId: mat.id,
      at: { warehouseId: wh.id },
      quantity: 1,
      reason: 'refund_by_client',
      notes: 'conteo',
    });
    expect(res.status).toBe(403);
  });

  test('notes are required by the validator, whatever the reason says', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Unserialized);
    const res = await post('/stock/readjust', ownerToken, {
      direction: ReadjustmentDirection.In,
      materialId: mat.id,
      at: { warehouseId: wh.id },
      quantity: 1,
      reason: 'refund_by_client',
    });
    expect(res.status).toBe(400);
  });

  test('in adds, out subtracts, and both land on the right side of the journal', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Unserialized);

    const up = await okJson<MovementBody>(
      await post('/stock/readjust', ownerToken, {
        direction: ReadjustmentDirection.In,
        materialId: mat.id,
        at: { warehouseId: wh.id },
        quantity: 9,
        reason: 'refund_by_client',
        notes: 'aparecieron',
      }),
      201,
    );
    expect(up.direction).toBe(ReadjustmentDirection.In);
    expect(up.to?.warehouse.id).toBe(wh.id);
    expect(up.from).toBeUndefined();

    const down = await okJson<MovementBody>(
      await post('/stock/readjust', ownerToken, {
        direction: ReadjustmentDirection.Out,
        materialId: mat.id,
        at: { warehouseId: wh.id },
        quantity: 4,
        reason: 'stock_cleaning',
        notes: 'depuración',
      }),
      201,
    );
    expect(down.from?.warehouse.id).toBe(wh.id);
    expect(down.to).toBeUndefined();

    expect(await quantityOf(wh.id, mat.id)).toBe('5');
  });

  test('a write-off loses the unit; any other out just takes it out of stock', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Serialized);
    const received = await okJson<MovementBody>(
      await post('/stock/inbound', ownerToken, {
        materialId: mat.id,
        to: { warehouseId: wh.id },
        serials: [`SN-${tag()}`, `SN-${tag()}`],
        reason: 'refund_by_client',
      }),
      201,
    );
    const [scrapped, delivered] = received.units;

    await okJson<MovementBody>(
      await post('/stock/readjust', ownerToken, {
        direction: ReadjustmentDirection.Out,
        materialId: mat.id,
        at: { warehouseId: wh.id },
        materialUnitIds: [scrapped!.id],
        reason: 'scrap',
        notes: 'se dañó en el traslado',
      }),
      201,
    );
    await okJson<MovementBody>(
      await post('/stock/readjust', ownerToken, {
        direction: ReadjustmentDirection.Out,
        materialId: mat.id,
        at: { warehouseId: wh.id },
        materialUnitIds: [delivered!.id],
        reason: 'returned_to_client',
        notes: 'entregado en sitio',
      }),
      201,
    );

    const rows = await db()
      .select({ id: materialUnits.id, status: materialUnits.status })
      .from(materialUnits)
      .where(eq(materialUnits.materialId, mat.id));
    const byId = new Map(rows.map((r) => [r.id, r.status]));
    expect(byId.get(scrapped!.id)).toBe(MaterialUnitStatus.Lost);
    expect(byId.get(delivered!.id)).toBe(MaterialUnitStatus.Consumed);

    // Neither is on hand any more, whichever story it tells.
    expect((await stockAt(wh.id)).units).toHaveLength(0);
  });

  test('an in-adjustment restores a unit that left, and refuses one still here', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Serialized);
    const received = await okJson<MovementBody>(
      await post('/stock/inbound', ownerToken, {
        materialId: mat.id,
        to: { warehouseId: wh.id },
        serials: [`SN-${tag()}`, `SN-${tag()}`],
        reason: 'refund_by_client',
      }),
      201,
    );
    const [gone, present] = received.units;

    await post('/stock/readjust', ownerToken, {
      direction: ReadjustmentDirection.Out,
      materialId: mat.id,
      at: { warehouseId: wh.id },
      materialUnitIds: [gone!.id],
      reason: 'return_to_provider',
      notes: 'a garantía',
    });

    await okJson<MovementBody>(
      await post('/stock/readjust', ownerToken, {
        direction: ReadjustmentDirection.In,
        materialId: mat.id,
        at: { warehouseId: wh.id },
        materialUnitIds: [gone!.id],
        reason: 'refund_by_client',
        notes: 'regresó de garantía',
      }),
      201,
    );
    expect((await stockAt(wh.id)).units.map((u) => u.id).sort()).toEqual(
      [gone!.id, present!.id].sort(),
    );

    // Restoring something already on hand would journal an increase that never
    // happened — moving a live piece is what `transfer` is for.
    const alreadyHere = await post('/stock/readjust', ownerToken, {
      direction: ReadjustmentDirection.In,
      materialId: mat.id,
      at: { warehouseId: wh.id },
      materialUnitIds: [present!.id],
      reason: 'refund_by_client',
      notes: 'no debería',
    });
    expect(alreadyHere.status).toBe(409);
    expect(await errorOf(alreadyHere)).toBe('unit_not_available');
  });

  test('serials may only be created on the way in', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Serialized);
    const res = await post('/stock/readjust', ownerToken, {
      direction: ReadjustmentDirection.Out,
      materialId: mat.id,
      at: { warehouseId: wh.id },
      serials: [`SN-${tag()}`],
      reason: 'scrap',
      notes: 'no existe',
    });
    expect(res.status).toBe(400);
  });
});

// ── idempotency (00 §6 #21) ────────────────────────────────────────────────

describe('idempotency', () => {
  test('a replayed key returns the original movement instead of doubling it', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Unserialized);
    const key = `wms-test-${tag()}-${tag()}`;
    const body = {
      materialId: mat.id,
      to: { warehouseId: wh.id },
      quantity: 7,
      reason: 'refund_by_client',
    };

    const first = await okJson<MovementBody>(
      await post('/stock/inbound', ownerToken, body, key),
      201,
    );
    // Same status, same body: a replay is indistinguishable from the original
    // request succeeding, which is the whole point — a retrying client should
    // not have to branch on whether its first attempt got through.
    const replay = await post('/stock/inbound', ownerToken, body, key);
    expect(replay.status).toBe(201);
    expect((await json<MovementBody>(replay)).id).toBe(first.id);

    // The balance moved exactly once.
    expect(await quantityOf(wh.id, mat.id)).toBe('7');
  });

  test('without a key, the same request books twice — retries are opt-in', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Unserialized);
    const body = {
      materialId: mat.id,
      to: { warehouseId: wh.id },
      quantity: 2,
      reason: 'refund_by_client',
    };
    await post('/stock/inbound', ownerToken, body);
    await post('/stock/inbound', ownerToken, body);
    expect(await quantityOf(wh.id, mat.id)).toBe('4');
  });
});

// ── §4 movements query ─────────────────────────────────────────────────────

describe('movements (02 §4)', () => {
  test('paged, newest first, and filterable by either side of a transfer', async () => {
    const [a, b] = await Promise.all([newWarehouse(), newWarehouse()]);
    const mat = await newMaterial(MaterialTracking.Unserialized);
    await post('/stock/inbound', ownerToken, {
      materialId: mat.id,
      to: { warehouseId: a.id },
      quantity: 10,
      reason: 'refund_by_client',
    });
    await post('/stock/transfer', ownerToken, {
      materialId: mat.id,
      from: { warehouseId: a.id },
      to: { warehouseId: b.id },
      quantity: 2,
      reason: 'relocation',
    });

    const all = await okJson<{ items: MovementBody[]; total: number }>(
      await request(`/movements?materialId=${mat.id}`, { headers: jsonHeaders(officeToken) }),
    );
    expect(all.total).toBe(2);
    expect(all.items[0]?.type).toBe(MovementType.Transfer);
    expect(all.items[1]?.type).toBe(MovementType.Inbound);
    expect(all.items[0]?.reason.label).toBe('Reubicación');

    // `warehouseId` matches EITHER side — the destination-only warehouse still
    // finds the transfer that landed there.
    const atB = await okJson<{ total: number }>(
      await request(`/movements?materialId=${mat.id}&warehouseId=${b.id}`, {
        headers: jsonHeaders(officeToken),
      }),
    );
    expect(atB.total).toBe(1);

    const inbound = await okJson<{ total: number }>(
      await request(`/movements?materialId=${mat.id}&type=${MovementType.Inbound}`, {
        headers: jsonHeaders(officeToken),
      }),
    );
    expect(inbound.total).toBe(1);

    const paged = await okJson<{ items: MovementBody[]; total: number }>(
      await request(`/movements?materialId=${mat.id}&page=2&limit=1`, {
        headers: jsonHeaders(officeToken),
      }),
    );
    expect(paged.total).toBe(2);
    expect(paged.items).toHaveLength(1);
    expect(paged.items[0]?.type).toBe(MovementType.Inbound);
  });

  test('a technician sees their own van and their own reports, nothing else', async () => {
    const shop = await newWarehouse('shop');
    const me = await newTechWithVan('van');
    const van = me.van;
    const mat = await newMaterial(MaterialTracking.Unserialized);

    // Someone else's business: a receipt into the shop.
    await post('/stock/inbound', ownerToken, {
      materialId: mat.id,
      to: { warehouseId: shop.id },
      quantity: 30,
      reason: 'refund_by_client',
    });
    // Their business: loading their own van.
    await post('/stock/transfer', me.token, {
      materialId: mat.id,
      from: { warehouseId: shop.id },
      to: { warehouseId: van.id },
      quantity: 5,
      reason: 'relocation',
    });

    // And a consumption booked against their own report. Written directly:
    // the endpoint that emits it is the report-materials slice (02 §7).
    const customer = await seedCustomer();
    const report = await seedReport({
      createdBy: me.id,
      assignedTo: me.id,
      clientId: customer.id,
    });
    await db()
      .insert(movements)
      .values({
        type: MovementType.Consumption,
        reason: 'report_binding',
        materialId: mat.id,
        quantity: '1',
        fromWarehouseId: shop.id,
        reportId: report.id,
        userId: me.id,
      });

    const mine = await okJson<{ items: MovementBody[]; total: number }>(
      await request(`/movements?materialId=${mat.id}`, { headers: jsonHeaders(me.token) }),
    );
    expect(mine.items.map((m) => m.type).sort()).toEqual(
      [MovementType.Consumption, MovementType.Transfer].sort(),
    );

    // Office sees all three, including the receipt the technician cannot.
    const everything = await okJson<{ total: number }>(
      await request(`/movements?materialId=${mat.id}`, { headers: jsonHeaders(officeToken) }),
    );
    expect(everything.total).toBe(3);

    // A colleague's technician sees none of it — no van of theirs is involved
    // and no report of theirs is bound.
    const stranger = await okJson<{ total: number }>(
      await request(`/movements?materialId=${mat.id}`, { headers: jsonHeaders(tech2Token) }),
    );
    expect(stranger.total).toBe(0);
  });
});

// ── stock math invariants (01 CP-2) ────────────────────────────────────────

describe('stock math (01 §3)', () => {
  test('the signed journal always equals the materialized balance', async () => {
    const [a, b] = await Promise.all([newWarehouse(), newWarehouse()]);
    const mat = await newMaterial(MaterialTracking.Unserialized);

    await post('/stock/inbound', ownerToken, {
      materialId: mat.id,
      to: { warehouseId: a.id },
      quantity: 20,
      reason: 'refund_by_client',
    });
    await post('/stock/transfer', ownerToken, {
      materialId: mat.id,
      from: { warehouseId: a.id },
      to: { warehouseId: b.id },
      quantity: 7,
      reason: 'relocation',
    });
    await post('/stock/readjust', ownerToken, {
      direction: ReadjustmentDirection.Out,
      materialId: mat.id,
      at: { warehouseId: a.id },
      quantity: 3,
      reason: 'stock_cleaning',
      notes: 'depuración',
    });
    await post('/stock/readjust', ownerToken, {
      direction: ReadjustmentDirection.In,
      materialId: mat.id,
      at: { warehouseId: b.id },
      quantity: 5,
      reason: 'refund_by_client',
      notes: 'reingreso',
    });

    // The invariant the whole design rests on (01 §3): balances are a cache of
    // the journal, so summing the journal has to reproduce them exactly.
    const conn = db();
    const journal = await conn
      .select()
      .from(movements)
      .where(eq(movements.materialId, mat.id));
    const summed = new Map<string, number>();
    for (const row of journal) {
      const quantity = Number(row.quantity ?? 0);
      if (row.fromWarehouseId) {
        summed.set(row.fromWarehouseId, (summed.get(row.fromWarehouseId) ?? 0) - quantity);
      }
      if (row.toWarehouseId) {
        summed.set(row.toWarehouseId, (summed.get(row.toWarehouseId) ?? 0) + quantity);
      }
    }

    const balances = await conn
      .select()
      .from(stockEntries)
      .where(eq(stockEntries.materialId, mat.id));
    expect(balances).toHaveLength(2);
    for (const balance of balances) {
      expect(Number(balance.quantity)).toBe(summed.get(balance.warehouseId) ?? 0);
    }
    expect(summed.get(a.id)).toBe(10);
    expect(summed.get(b.id)).toBe(12);
  });

  test('a unit ends up where its last movement says it went', async () => {
    const [a, b] = await Promise.all([newWarehouse(), newWarehouse()]);
    const mat = await newMaterial(MaterialTracking.Serialized);
    const received = await okJson<MovementBody>(
      await post('/stock/inbound', ownerToken, {
        materialId: mat.id,
        to: { warehouseId: a.id },
        serials: [`SN-${tag()}`],
        reason: 'refund_by_client',
      }),
      201,
    );
    const unit = received.units[0]!;

    const moved = await okJson<MovementBody>(
      await post('/stock/transfer', ownerToken, {
        materialId: mat.id,
        from: { warehouseId: a.id },
        to: { warehouseId: b.id },
        materialUnitIds: [unit.id],
        reason: 'relocation',
      }),
      201,
    );
    expect(moved.units.map((u) => u.id)).toEqual([unit.id]);

    const [row] = await db()
      .select({ warehouseId: materialUnits.warehouseId, status: materialUnits.status })
      .from(materialUnits)
      .where(eq(materialUnits.id, unit.id));
    expect(row?.warehouseId).toBe(b.id);
    expect(row?.status).toBe(MaterialUnitStatus.InStock);
  });

  test('two parallel draws off one balance: one lands, one is refused', async () => {
    const [a, b] = await Promise.all([newWarehouse(), newWarehouse()]);
    const mat = await newMaterial(MaterialTracking.Unserialized);
    await post('/stock/inbound', ownerToken, {
      materialId: mat.id,
      to: { warehouseId: a.id },
      quantity: 10,
      reason: 'refund_by_client',
    });

    const draw = () =>
      post('/stock/transfer', ownerToken, {
        materialId: mat.id,
        from: { warehouseId: a.id },
        to: { warehouseId: b.id },
        quantity: 8,
        reason: 'relocation',
      });

    // `SELECT … FOR UPDATE` serializes them: the loser reads the balance the
    // winner already spent, rather than both reading "enough" and both
    // committing. The `CHECK (quantity >= 0)` is the backstop, not the plan.
    const [first, second] = await Promise.all([draw(), draw()]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await quantityOf(a.id, mat.id)).toBe('2');
    expect(await quantityOf(b.id, mat.id)).toBe('8');
  });
});

// ── append-only ────────────────────────────────────────────────────────────

describe('the journal is append-only (01 §2)', () => {
  test('there is no way to edit or remove a movement', async () => {
    const wh = await newWarehouse();
    const mat = await newMaterial(MaterialTracking.Unserialized);
    const movement = await okJson<MovementBody>(
      await post('/stock/inbound', ownerToken, {
        materialId: mat.id,
        to: { warehouseId: wh.id },
        quantity: 1,
        reason: 'refund_by_client',
      }),
      201,
    );

    for (const [method, path] of [
      ['PATCH', `/movements/${movement.id}`],
      ['DELETE', `/movements/${movement.id}`],
      ['PATCH', `/stock/${movement.id}`],
      ['DELETE', `/stock/${movement.id}`],
    ] as const) {
      const res = await request(path, { method, headers: jsonHeaders(ownerToken) });
      expect(res.status).toBe(404);
    }
  });
});

// ── settings store ─────────────────────────────────────────────────────────

describe('wms settings store (02 §1)', () => {
  test('an unwritten key behaves exactly like its default', async () => {
    // Provisioning seeds nothing, so "never written" and "written to the
    // default" have to be indistinguishable to every reader.
    const absent = await getSetting(
      db(),
      `wms.test_absent_${tag()}`,
      WMS_SETTING_DEFAULTS.stockCountBlind,
    );
    expect(absent).toBe(true);
  });

  test('a value round-trips and overwrites in place', async () => {
    // One stable test key, rewritten each run — new settings are new rows, so a
    // per-run key would hoard them.
    const key = 'wms.test_roundtrip';
    await setSetting(db(), key, { columns: ['sku', 'qty'], at: 1 });
    expect(await getSetting(db(), key, null)).toEqual({ columns: ['sku', 'qty'], at: 1 });

    await setSetting(db(), key, { columns: ['upc'], at: 2 });
    expect(await getSetting(db(), key, null)).toEqual({ columns: ['upc'], at: 2 });
  });
});
