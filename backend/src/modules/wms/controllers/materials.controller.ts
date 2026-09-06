import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppBindings } from '../../../env';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { createDb } from '../../database/client';
import { materialErrorResponse } from '../http-errors/materials.error-response';
import {
  createMaterial,
  editMaterial,
  getMaterial,
  getMaterials,
  getMaterialStock,
  removeMaterial,
} from '../services/materials.service';
import {
  createMaterialSchema,
  listMaterialsQuerySchema,
  updateMaterialSchema,
} from '../validators/materials.validator';

export const materials = new Hono<AppBindings>();

const idSchema = z.string().uuid();

// Catalog writes are owner/admin. Reads are open to every authenticated role
// with NO special casing (02 §3): the technician read *is* the stock-lookup
// surface (09 §2), and a forked technician endpoint is exactly what the reuse
// rule forbids. Nothing in a material row is confidential — there is no `cost`
// here, unlike the services catalog.
const catalogWriteRoles = requireRole(['owner', 'admin']);

materials.get('/', zValidator('query', listMaterialsQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getMaterials(db, c.req.valid('query')));
});

materials.post('/', catalogWriteRoles, zValidator('json', createMaterialSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  try {
    return c.json(await createMaterial(db, c.req.valid('json')), 201);
  } catch (err) {
    return materialErrorResponse(c, err);
  }
});

materials.get('/:id', async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  const row = await getMaterial(db, id.data);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(row);
});

// Where the material physically is, in whichever of the three shapes its
// tracking mode uses.
materials.get('/:id/stock', async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  const stock = await getMaterialStock(db, id.data);
  if (!stock) return c.json({ error: 'not_found' }, 404);
  return c.json(stock);
});

materials.patch('/:id', catalogWriteRoles, zValidator('json', updateMaterialSchema), async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  try {
    const row = await editMaterial(db, id.data, c.req.valid('json'));
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(row);
  } catch (err) {
    return materialErrorResponse(c, err);
  }
});

// Soft, and only at zero stock everywhere. No delete comment: the movement
// journal is this module's audit trail.
materials.delete('/:id', catalogWriteRoles, async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  try {
    const row = await removeMaterial(db, id.data);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ id: row.id, deleted: true });
  } catch (err) {
    return materialErrorResponse(c, err);
  }
});
