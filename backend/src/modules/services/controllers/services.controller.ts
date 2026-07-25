import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { isAdminTier } from '../../auth/utils/role-tier';
import {
  createServiceSchema,
  deleteServiceSchema,
  listServicesQuerySchema,
  updateServiceSchema,
} from '../validators/services.validator';
import {
  createService,
  editService,
  getServiceById,
  getServices,
  removeService,
} from '../services/services-catalog.service';

export const services = new Hono<AppBindings>();

// Reads are open to any authenticated role — every quotation/order picker needs
// the catalog (18 §2). The internal `cost` is redacted below admin tier.
services.get('/', zValidator('query', listServicesQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getServices(db, c.req.valid('query'), isAdminTier(c.get('user'))));
});

services.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await getServiceById(db, c.req.param('id'), isAdminTier(c.get('user')));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(row);
});

// Writes are admin-tier (owner/admin) — office never edits the catalog.
services.post('/', requireRole(['owner', 'admin']), zValidator('json', createServiceSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await createService(db, c.req.valid('json')), 201);
});

services.patch(
  '/:id',
  requireRole(['owner', 'admin']),
  zValidator('json', updateServiceSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const row = await editService(db, c.req.param('id'), c.req.valid('json'));
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(row);
  },
);

// Soft delete never blocks on references: quotation/order lines snapshot the
// price and keep their FK, so history survives a removed service (18 §1).
services.delete(
  '/:id',
  requireRole(['owner', 'admin']),
  zValidator('json', deleteServiceSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const { deleteComment } = c.req.valid('json');
    const row = await removeService(db, c.req.param('id'), deleteComment, c.get('user').id);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ id: row.id, deleted: true });
  },
);
