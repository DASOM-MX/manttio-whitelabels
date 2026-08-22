import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppBindings } from '../../../env';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { createDb } from '../../database/client';
import { warehouseErrorResponse } from '../http-errors/warehouses.error-response';
import {
  createStorageNode,
  editStorageNode,
  getStorageNodes,
  removeStorageNode,
} from '../services/storage-nodes.service';
import {
  assignWarehouse,
  createWarehouse,
  editWarehouse,
  getWarehouse,
  getWarehouses,
  getWarehouseStock,
  getWarehouseTree,
  removeWarehouse,
} from '../services/warehouses.service';
import {
  assignWarehouseSchema,
  createStorageNodeSchema,
  createWarehouseSchema,
  listStorageNodesQuerySchema,
  listWarehousesQuerySchema,
  updateStorageNodeSchema,
  updateWarehouseSchema,
  warehouseStockQuerySchema,
} from '../validators/warehouses.validator';

export const warehouses = new Hono<AppBindings>();

// Both PKs are uuids, so a malformed one can never match a row — 404 up front
// rather than letting Postgres throw on the cast (an uncaught 500).
const idSchema = z.string().uuid();

// Structure is owner/admin: office is operational (it moves stock, 14 §2.1) but
// does not shape the warehouse registry. Reads below are deliberately open —
// each one scopes itself, because a technician may see their own van.
const structureRoles = requireRole(['owner', 'admin']);

warehouses.get('/', zValidator('query', listWarehousesQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getWarehouses(db, c.get('user'), c.req.valid('query')));
});

// Registered before `/:id` so "tree" is never read as an id.
warehouses.get('/tree', requireRole(['owner', 'admin', 'office']), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getWarehouseTree(db));
});

warehouses.post('/', structureRoles, zValidator('json', createWarehouseSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  try {
    return c.json(await createWarehouse(db, c.req.valid('json')), 201);
  } catch (err) {
    return warehouseErrorResponse(c, err);
  }
});

warehouses.get('/:id', async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  try {
    const row = await getWarehouse(db, c.get('user'), id.data);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(row);
  } catch (err) {
    return warehouseErrorResponse(c, err);
  }
});

warehouses.patch('/:id', structureRoles, zValidator('json', updateWarehouseSchema), async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  try {
    const row = await editWarehouse(db, id.data, c.req.valid('json'));
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(row);
  } catch (err) {
    return warehouseErrorResponse(c, err);
  }
});

// Soft delete, empty-only, cascading to the warehouse's storage nodes. No
// delete comment: the movement journal is this module's audit trail (03 §3).
warehouses.delete('/:id', structureRoles, async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  try {
    const row = await removeWarehouse(db, id.data);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ id: row.id, deleted: true });
  } catch (err) {
    return warehouseErrorResponse(c, err);
  }
});

// Path kept from 02 §2; the body gained `role` when the column did (user
// 2026-08-21) — assignee and role are stored together, and the assignee may be
// a supervisor or leader rather than a van's technician.
warehouses.post(
  '/:id/assign-technician',
  structureRoles,
  zValidator('json', assignWarehouseSchema),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const db = createDb(c.env.DATABASE_URL);
    try {
      const row = await assignWarehouse(db, id.data, c.req.valid('json'));
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    } catch (err) {
      return warehouseErrorResponse(c, err);
    }
  },
);

// ── Storage nodes — the structure inside one warehouse (01 §2) ──────────────

warehouses.get('/:id/nodes', zValidator('query', listStorageNodesQuerySchema), async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  try {
    return c.json(await getStorageNodes(db, c.get('user'), id.data, c.req.valid('query')));
  } catch (err) {
    return warehouseErrorResponse(c, err);
  }
});

warehouses.post(
  '/:id/nodes',
  structureRoles,
  zValidator('json', createStorageNodeSchema),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const db = createDb(c.env.DATABASE_URL);
    try {
      return c.json(
        await createStorageNode(db, c.get('user'), id.data, c.req.valid('json')),
        201,
      );
    } catch (err) {
      return warehouseErrorResponse(c, err);
    }
  },
);

warehouses.patch(
  '/:id/nodes/:nodeId',
  structureRoles,
  zValidator('json', updateStorageNodeSchema),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    const nodeId = idSchema.safeParse(c.req.param('nodeId'));
    if (!id.success || !nodeId.success) return c.json({ error: 'not_found' }, 404);
    const db = createDb(c.env.DATABASE_URL);
    try {
      const row = await editStorageNode(
        db,
        c.get('user'),
        id.data,
        nodeId.data,
        c.req.valid('json'),
      );
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    } catch (err) {
      return warehouseErrorResponse(c, err);
    }
  },
);

warehouses.delete('/:id/nodes/:nodeId', structureRoles, async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  const nodeId = idSchema.safeParse(c.req.param('nodeId'));
  if (!id.success || !nodeId.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  try {
    const row = await removeStorageNode(db, c.get('user'), id.data, nodeId.data);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ id: row.id, deleted: true });
  } catch (err) {
    return warehouseErrorResponse(c, err);
  }
});

// What is physically here, optionally narrowed to one location (04 §2).
warehouses.get('/:id/stock', zValidator('query', warehouseStockQuerySchema), async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  try {
    const stock = await getWarehouseStock(
      db,
      c.get('user'),
      id.data,
      c.req.valid('query').nodeId,
    );
    if (!stock) return c.json({ error: 'not_found' }, 404);
    return c.json(stock);
  } catch (err) {
    return warehouseErrorResponse(c, err);
  }
});
