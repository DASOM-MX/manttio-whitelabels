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
import { materials, stockEntries, storageNodes, warehouses } from '../src/modules/database/schema';
import { AssignmentRole } from '../src/modules/wms/enums/assignments.enum';
import { MaterialTracking } from '../src/modules/wms/enums/materials.enum';
import { StorageNodeType } from '../src/modules/wms/enums/storage-nodes.enum';
import { WarehouseType } from '../src/modules/wms/enums/warehouses.enum';

// Endpoint behaviour for 10-wms/02 §2 — the storage-units slice. Schema-shape
// assertions live in `wms-data-model.test.ts` (pure, no DB); everything here
// goes through the API against the live Neon DB.
//
// `warehouses` and `storage_nodes` have no email column, so fixtures carry the
// marker in their NAME (`wms-test-…`, per 02 CP-1) and `afterAll` soft-deletes
// by that prefix. Per the no-hard-delete rule the rows stay.

type WorkerEnv = { DATABASE_URL: string };

const FIXTURE_PREFIX = 'wms-test-';
const tag = () => Math.random().toString(36).slice(2, 10);
const wmsName = (scope: string) => `${FIXTURE_PREFIX}${scope}-${tag()}`;

const db = () => createDb((env as unknown as WorkerEnv).DATABASE_URL);

let ownerToken = '';
let adminToken = '';
let officeToken = '';
let techToken = '';
let techId = '';
let adminId = '';

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
  techId = tech.tech.id;
  adminId = admin.admin.id;
});

afterAll(async () => {
  const conn = db();
  const now = new Date();
  // Nodes first: a live node under a dead warehouse is the exact orphan the
  // cascade exists to prevent, and the test data should not model one.
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

const locatable = { locationReference: 'wms-test bodega del fondo' };

const createWarehouse = (token: string, body: object = {}) =>
  request('/warehouses', {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ name: wmsName('wh'), ...locatable, ...body }),
  });

const seedWarehouse = async (body: object = {}) => {
  const res = await createWarehouse(ownerToken, body);
  expect(res.status).toBe(201);
  return json<{ id: string; name: string; type: WarehouseType }>(res);
};

const createNode = (token: string, warehouseId: string, body: object) =>
  request(`/warehouses/${warehouseId}/nodes`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ name: wmsName('node'), ...body }),
  });

const seedNode = async (warehouseId: string, body: object) => {
  const res = await createNode(ownerToken, warehouseId, body);
  expect(res.status).toBe(201);
  return json<{ id: string; type: StorageNodeType; name: string }>(res);
};

describe('warehouse registry (02 §2)', () => {
  test('a warehouse must be locatable — no reference, no coordinates, no warehouse', async () => {
    const res = await request('/warehouses', {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ name: wmsName('nowhere') }),
    });
    expect(res.status).toBe(400);
  });

  test('a lone coordinate is refused before it reaches the DB check', async () => {
    const res = await request('/warehouses', {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ name: wmsName('halfpin'), latitude: 25.68 }),
    });
    expect(res.status).toBe(400);
  });

  test('a coordinate pair alone satisfies locatability', async () => {
    const res = await request('/warehouses', {
      method: 'POST',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({ name: wmsName('pinned'), latitude: 25.68, longitude: -100.31 }),
    });
    expect(res.status).toBe(201);
    const body = await json<{ latitude: number; longitude: number }>(res);
    expect(body.latitude).toBe(25.68);
    expect(body.longitude).toBe(-100.31);
  });

  test('a PATCH may not erase the last thing that locates a warehouse', async () => {
    const wh = await seedWarehouse();

    const patch = (body: object) =>
      request(`/warehouses/${wh.id}`, {
        method: 'PATCH',
        headers: jsonHeaders(ownerToken),
        body: JSON.stringify(body),
      });

    // Seeded with a reference and no pin, so clearing it leaves nothing —
    // and `null` here means CLEAR, not "unchanged".
    const stripped = await patch({ locationReference: null });
    expect(stripped.status).toBe(400);
    expect(await json<{ error: string }>(stripped)).toMatchObject({
      error: 'warehouse_not_locatable',
    });

    // With a pin standing in for it, dropping the reference is fine.
    expect((await patch({ latitude: 25.68, longitude: -100.31 })).status).toBe(200);
    expect((await patch({ locationReference: null })).status).toBe(200);

    // Now the pin is the last locator, so it is the one that can't go.
    expect((await patch({ latitude: null, longitude: null })).status).toBe(400);
  });

  test('half a pin cannot be cleared either — `null` is not "unchanged"', async () => {
    // The regression this test exists for: the pair rule compared `undefined`
    // only, so a body clearing ONE coordinate sailed past it and the DB check
    // answered with a 500 (and the raw constraint name in the message).
    const wh = await seedWarehouse();
    const patch = (body: object) =>
      request(`/warehouses/${wh.id}`, {
        method: 'PATCH',
        headers: jsonHeaders(ownerToken),
        body: JSON.stringify(body),
      });

    expect((await patch({ latitude: 25.68, longitude: -100.31 })).status).toBe(200);

    for (const half of [
      { latitude: null, longitude: -100.31 },
      { latitude: 25.68, longitude: null },
    ]) {
      const res = await patch(half);
      expect(res.status).toBe(400);
    }

    // The legitimate edit this was blocking: drop the pin, keep the reference.
    // Both coordinates go together, and the warehouse stays locatable.
    const dropped = await patch({ latitude: null, longitude: null });
    expect(dropped.status).toBe(200);
    const body = await json<{ latitude?: number; longitude?: number }>(dropped);
    expect(body.latitude).toBeUndefined();
    expect(body.longitude).toBeUndefined();
  });

  test('type is derived from the parent, never sent', async () => {
    const root = await seedWarehouse();
    expect(root.type).toBe(WarehouseType.Warehouse);
    const sub = await seedWarehouse({ parentId: root.id });
    expect(sub.type).toBe(WarehouseType.SubWarehouse);
  });

  test('nesting stops at one level', async () => {
    const root = await seedWarehouse();
    const sub = await seedWarehouse({ parentId: root.id });
    const res = await createWarehouse(ownerToken, { parentId: sub.id });
    expect(res.status).toBe(400);
    expect(await json<{ error: string }>(res)).toMatchObject({ error: 'invalid_parent' });
  });

  test('structure is owner/admin — office reads, technicians do not write', async () => {
    expect((await createWarehouse(adminToken)).status).toBe(201);
    expect((await createWarehouse(officeToken)).status).toBe(403);
    expect((await createWarehouse(techToken)).status).toBe(403);

    const listed = await request('/warehouses', { headers: jsonHeaders(officeToken) });
    expect(listed.status).toBe(200);
  });

  test('the tree nests subs under roots and summarizes their stock', async () => {
    const root = await seedWarehouse();
    const sub = await seedWarehouse({ parentId: root.id });

    const res = await request('/warehouses/tree', { headers: jsonHeaders(ownerToken) });
    expect(res.status).toBe(200);
    const body = await json<{
      warehouses: {
        id: string;
        children: { id: string }[];
        stockSummary: { materialCount: number; unitCount: number };
      }[];
    }>(res);

    const found = body.warehouses.find((w) => w.id === root.id);
    expect(found?.children.map((child) => child.id)).toContain(sub.id);
    // Nothing has been received anywhere yet, so an empty warehouse reports
    // zeros rather than omitting the block.
    expect(found?.stockSummary).toEqual({ materialCount: 0, unitCount: 0 });
  });

  test('the tree is staff-only — a technician gets 403', async () => {
    const res = await request('/warehouses/tree', { headers: jsonHeaders(techToken) });
    expect(res.status).toBe(403);
  });

  test('a malformed id 404s instead of throwing on the uuid cast', async () => {
    const res = await request('/warehouses/not-a-uuid', { headers: jsonHeaders(ownerToken) });
    expect(res.status).toBe(404);
  });
});

describe('warehouse assignment (02 §2)', () => {
  const assign = (token: string, id: string, body: object) =>
    request(`/warehouses/${id}/assign-technician`, {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(body),
    });

  test('an assignee without a role is refused — the two are stored together', async () => {
    const wh = await seedWarehouse();
    expect((await assign(ownerToken, wh.id, { userId: techId })).status).toBe(400);
  });

  test('the technician role means an actual technician', async () => {
    const wh = await seedWarehouse();
    const res = await assign(ownerToken, wh.id, {
      userId: adminId,
      role: AssignmentRole.Technician,
    });
    expect(res.status).toBe(400);
    expect(await json<{ error: string }>(res)).toMatchObject({ error: 'not_a_technician' });
  });

  test('an admin may supervise a warehouse — only the van role is restricted', async () => {
    const wh = await seedWarehouse();
    const res = await assign(ownerToken, wh.id, {
      userId: adminId,
      role: AssignmentRole.Supervisor,
    });
    expect(res.status).toBe(200);
    expect(await json<{ assignedUser: { id: string; role: string } }>(res)).toMatchObject({
      assignedUser: { id: adminId, role: AssignmentRole.Supervisor },
    });
  });

  test('one van per technician, and unassigning frees them again', async () => {
    const first = await seedWarehouse();
    const second = await seedWarehouse();

    expect(
      (await assign(ownerToken, first.id, { userId: techId, role: AssignmentRole.Technician }))
        .status,
    ).toBe(200);

    const clash = await assign(ownerToken, second.id, {
      userId: techId,
      role: AssignmentRole.Technician,
    });
    expect(clash.status).toBe(409);
    expect(await json<{ error: string }>(clash)).toMatchObject({
      error: 'technician_already_assigned',
    });

    expect((await assign(ownerToken, first.id, { userId: null })).status).toBe(200);
    expect(
      (await assign(ownerToken, second.id, { userId: techId, role: AssignmentRole.Technician }))
        .status,
    ).toBe(200);
    // Leave the technician free for the scoping tests below.
    expect((await assign(ownerToken, second.id, { userId: null })).status).toBe(200);
  });

  test('the same user may supervise several warehouses', async () => {
    const first = await seedWarehouse();
    const second = await seedWarehouse();
    const body = { userId: adminId, role: AssignmentRole.Leader };
    expect((await assign(ownerToken, first.id, body)).status).toBe(200);
    expect((await assign(ownerToken, second.id, body)).status).toBe(200);
  });
});

describe('technician scoping (02 §2a)', () => {
  test("a technician sees their own van and never a colleague's", async () => {
    const own = await seedWarehouse();
    const foreign = await seedWarehouse();
    const other = await seedTechnicianAndLogin();

    const assign = (id: string, userId: string) =>
      request(`/warehouses/${id}/assign-technician`, {
        method: 'POST',
        headers: jsonHeaders(ownerToken),
        body: JSON.stringify({ userId, role: AssignmentRole.Technician }),
      });
    expect((await assign(own.id, techId)).status).toBe(200);
    expect((await assign(foreign.id, other.tech.id)).status).toBe(200);

    const res = await request('/warehouses', { headers: jsonHeaders(techToken) });
    const body = await json<{ warehouses: { id: string }[] }>(res);
    const ids = body.warehouses.map((w) => w.id);
    expect(ids).toContain(own.id);
    expect(ids).not.toContain(foreign.id);

    // Staff see both — office is operational and needs to know where stock is.
    const staff = await request('/warehouses', { headers: jsonHeaders(officeToken) });
    const staffIds = (await json<{ warehouses: { id: string }[] }>(staff)).warehouses.map(
      (w) => w.id,
    );
    expect(staffIds).toEqual(expect.arrayContaining([own.id, foreign.id]));

    expect((await request(`/warehouses/${own.id}`, { headers: jsonHeaders(techToken) })).status).toBe(
      200,
    );
    const denied = await request(`/warehouses/${foreign.id}`, { headers: jsonHeaders(techToken) });
    expect(denied.status).toBe(403);
    expect(await json<{ error: string }>(denied)).toMatchObject({ error: 'not_own_van' });
  });
});

describe('storage-node hierarchy (02 §2)', () => {
  test('a root node may be any type, including the warehouse level', async () => {
    const wh = await seedWarehouse();
    const node = await seedNode(wh.id, { type: StorageNodeType.Warehouse });
    expect(node.type).toBe(StorageNodeType.Warehouse);
    // A small warehouse that is "just racks" needs no fake unit above them.
    await seedNode(wh.id, { type: StorageNodeType.Rack });
  });

  test('a child must outrank its parent, and levels are skippable', async () => {
    const wh = await seedWarehouse();
    const unit = await seedNode(wh.id, { type: StorageNodeType.StorageUnit });

    // Skipping rack and section is legal.
    const box = await createNode(ownerToken, wh.id, {
      type: StorageNodeType.StorageBox,
      parentNodeId: unit.id,
    });
    expect(box.status).toBe(201);

    // Climbing back up is not.
    const inverted = await createNode(ownerToken, wh.id, {
      type: StorageNodeType.Warehouse,
      parentNodeId: unit.id,
    });
    expect(inverted.status).toBe(400);
    expect(await json<{ error: string }>(inverted)).toMatchObject({
      error: 'invalid_parent_type',
    });

    // Nor is nesting a type inside itself.
    const flat = await createNode(ownerToken, wh.id, {
      type: StorageNodeType.StorageUnit,
      parentNodeId: unit.id,
    });
    expect(flat.status).toBe(400);
  });

  test('sibling names are unique among live nodes', async () => {
    const wh = await seedWarehouse();
    const name = wmsName('dup');
    expect((await createNode(ownerToken, wh.id, { name, type: StorageNodeType.Rack })).status).toBe(
      201,
    );
    const clash = await createNode(ownerToken, wh.id, { name, type: StorageNodeType.Rack });
    expect(clash.status).toBe(409);
    expect(await json<{ error: string }>(clash)).toMatchObject({ error: 'duplicate_node_name' });
  });

  test('a node from another warehouse cannot be a parent', async () => {
    const [a, b] = [await seedWarehouse(), await seedWarehouse()];
    const foreign = await seedNode(a.id, { type: StorageNodeType.StorageUnit });
    const res = await createNode(ownerToken, b.id, {
      type: StorageNodeType.Rack,
      parentNodeId: foreign.id,
    });
    expect(res.status).toBe(400);
    expect(await json<{ error: string }>(res)).toMatchObject({
      error: 'node_warehouse_mismatch',
    });
  });

  test('hasChildren drives the lazy tree', async () => {
    const wh = await seedWarehouse();
    const unit = await seedNode(wh.id, { type: StorageNodeType.StorageUnit });
    const leaf = await seedNode(wh.id, { type: StorageNodeType.Rack });

    const roots = await json<{ nodes: { id: string; hasChildren: boolean }[] }>(
      await request(`/warehouses/${wh.id}/nodes`, { headers: jsonHeaders(ownerToken) }),
    );
    expect(roots.nodes.find((n) => n.id === unit.id)?.hasChildren).toBe(false);

    await seedNode(wh.id, { type: StorageNodeType.Rack, parentNodeId: unit.id });
    const after = await json<{ nodes: { id: string; hasChildren: boolean }[] }>(
      await request(`/warehouses/${wh.id}/nodes`, { headers: jsonHeaders(ownerToken) }),
    );
    expect(after.nodes.find((n) => n.id === unit.id)?.hasChildren).toBe(true);
    expect(after.nodes.find((n) => n.id === leaf.id)?.hasChildren).toBe(false);
  });
});

describe('storage-node assignment + writes (user 2026-08-21)', () => {
  test('only the top two levels carry someone in charge', async () => {
    const wh = await seedWarehouse();

    const onUnit = await createNode(ownerToken, wh.id, {
      type: StorageNodeType.StorageUnit,
      assignedUserId: techId,
      assignmentRole: AssignmentRole.Technician,
    });
    expect(onUnit.status).toBe(201);
    expect(await json<{ assignedUser: { role: string } }>(onUnit)).toMatchObject({
      assignedUser: { id: techId, role: AssignmentRole.Technician },
    });

    const onRack = await createNode(ownerToken, wh.id, {
      type: StorageNodeType.Rack,
      assignedUserId: techId,
      assignmentRole: AssignmentRole.Technician,
    });
    expect(onRack.status).toBe(400);
    expect(await json<{ error: string }>(onRack)).toMatchObject({
      error: 'invalid_assignment_level',
    });
  });

  test('an assignee and its role travel together', async () => {
    const wh = await seedWarehouse();
    const halfway = await createNode(ownerToken, wh.id, {
      type: StorageNodeType.StorageUnit,
      assignedUserId: techId,
    });
    expect(halfway.status).toBe(400);
  });

  test('a PATCH changes the role alone, and clears the pair together', async () => {
    const wh = await seedWarehouse();
    const node = await seedNode(wh.id, {
      type: StorageNodeType.StorageUnit,
      assignedUserId: adminId,
      assignmentRole: AssignmentRole.Supervisor,
    });

    const patch = (body: object) =>
      request(`/warehouses/${wh.id}/nodes/${node.id}`, {
        method: 'PATCH',
        headers: jsonHeaders(ownerToken),
        body: JSON.stringify(body),
      });

    const rolechange = await patch({ assignmentRole: AssignmentRole.Leader });
    expect(rolechange.status).toBe(200);
    expect(await json<{ assignedUser: { role: string } }>(rolechange)).toMatchObject({
      assignedUser: { id: adminId, role: AssignmentRole.Leader },
    });

    // Clearing only the user would leave a dangling role — refused.
    expect((await patch({ assignedUserId: null })).status).toBe(400);

    const cleared = await patch({ assignedUserId: null, assignmentRole: null });
    expect(cleared.status).toBe(200);
    expect(await json<{ assignedUser?: unknown }>(cleared)).not.toHaveProperty('assignedUser');
  });

  test('description and location reference are writable, the type is not', async () => {
    const wh = await seedWarehouse();
    const node = await seedNode(wh.id, {
      type: StorageNodeType.Rack,
      description: 'refacciones de compresor',
      locationReference: 'pasillo 3, pared norte',
    });

    const res = await request(`/warehouses/${wh.id}/nodes/${node.id}`, {
      method: 'PATCH',
      headers: jsonHeaders(ownerToken),
      body: JSON.stringify({
        description: 'refacciones de chiller',
        type: StorageNodeType.StorageBox,
      }),
    });
    expect(res.status).toBe(200);
    const body = await json<{ description: string; type: string; locationReference: string }>(res);
    expect(body.description).toBe('refacciones de chiller');
    expect(body.locationReference).toBe('pasillo 3, pared norte');
    // `type` is immutable after create — the body's attempt is ignored, not honored.
    expect(body.type).toBe(StorageNodeType.Rack);
  });
});

describe('deletion is soft, empty-only, and cascades to nodes (01 §2)', () => {
  test('a warehouse with sub-warehouses stays', async () => {
    const root = await seedWarehouse();
    await seedWarehouse({ parentId: root.id });
    const res = await request(`/warehouses/${root.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(ownerToken),
    });
    expect(res.status).toBe(409);
    expect(await json<{ error: string }>(res)).toMatchObject({ error: 'warehouse_not_empty' });
  });

  test('a warehouse holding stock stays; drained, it deletes and takes its nodes', async () => {
    const wh = await seedWarehouse();
    const node = await seedNode(wh.id, { type: StorageNodeType.StorageUnit });

    const conn = db();
    const [material] = await conn
      .insert(materials)
      .values({
        name: wmsName('material'),
        unit: 'pza',
        tracking: MaterialTracking.Unserialized,
      })
      .returning();
    if (!material) throw new Error('fixture material insert returned no row');
    const [entry] = await conn
      .insert(stockEntries)
      .values({
        materialId: material.id,
        warehouseId: wh.id,
        storageNodeId: node.id,
        quantity: '5',
      })
      .returning();
    if (!entry) throw new Error('fixture stock entry insert returned no row');

    const del = (id: string) =>
      request(`/warehouses/${id}`, { method: 'DELETE', headers: jsonHeaders(ownerToken) });

    const blocked = await del(wh.id);
    expect(blocked.status).toBe(409);
    expect(await json<{ error: string }>(blocked)).toMatchObject({ error: 'warehouse_not_empty' });

    const nodeBlocked = await request(`/warehouses/${wh.id}/nodes/${node.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(ownerToken),
    });
    expect(nodeBlocked.status).toBe(409);
    expect(await json<{ error: string }>(nodeBlocked)).toMatchObject({ error: 'node_not_empty' });

    // Draining is the real-world exit: `stock_entries` has no `deleted_at` by
    // design (01 §2) — a location that ran out keeps its zero. Done directly
    // because emitting the movement that would normally do it is the stock
    // submodule's transaction, not this slice's.
    await conn.update(stockEntries).set({ quantity: '0' }).where(eq(stockEntries.id, entry.id));

    expect((await del(wh.id)).status).toBe(200);

    // Soft, and the node went with it in the same transaction — a live node
    // under a dead warehouse would be unreachable structure holding stock.
    const [deadWarehouse] = await conn
      .select({ deletedAt: warehouses.deletedAt })
      .from(warehouses)
      .where(eq(warehouses.id, wh.id));
    expect(deadWarehouse?.deletedAt).not.toBeNull();
    const [deadNode] = await conn
      .select({ deletedAt: storageNodes.deletedAt })
      .from(storageNodes)
      .where(eq(storageNodes.id, node.id));
    expect(deadNode?.deletedAt).not.toBeNull();

    expect((await request(`/warehouses/${wh.id}`, { headers: jsonHeaders(ownerToken) })).status).toBe(
      404,
    );
  });

  test('an empty node deletes', async () => {
    const wh = await seedWarehouse();
    const node = await seedNode(wh.id, { type: StorageNodeType.Rack });
    const res = await request(`/warehouses/${wh.id}/nodes/${node.id}`, {
      method: 'DELETE',
      headers: jsonHeaders(ownerToken),
    });
    expect(res.status).toBe(200);
  });
});

describe('stock at a location (02 §2)', () => {
  test('an empty warehouse answers three empty lists, not a 404', async () => {
    const wh = await seedWarehouse();
    const res = await request(`/warehouses/${wh.id}/stock`, { headers: jsonHeaders(ownerToken) });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ entries: [], units: [], lots: [] });
  });

  test('a node from another warehouse cannot scope the read', async () => {
    const [a, b] = [await seedWarehouse(), await seedWarehouse()];
    const foreign = await seedNode(a.id, { type: StorageNodeType.Rack });
    const res = await request(`/warehouses/${b.id}/stock?nodeId=${foreign.id}`, {
      headers: jsonHeaders(ownerToken),
    });
    expect(res.status).toBe(400);
    expect(await json<{ error: string }>(res)).toMatchObject({
      error: 'node_warehouse_mismatch',
    });
  });
});
