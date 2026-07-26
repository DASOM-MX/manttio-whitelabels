import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { ServiceCodeInUseError } from '../http-errors/services.error';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { isBackOfficeTier } from '../../auth/utils/role-tier';
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

/** Duplicate catalog code → 409. The message names the code so the dialog can
 *  say which one clashed rather than a bare "already in use". */
const codeInUse = (c: Context<AppBindings>, err: ServiceCodeInUseError) =>
  c.json(
    {
      error: 'internal_service_code_in_use',
      message: `Ya existe un servicio con el código "${err.code}".`,
    },
    409,
  );

// Reads are open to any authenticated role — office and technician both work
// from this catalog, prices included (18 §2). The internal `cost` is the one
// field held back, and only from technicians: office quotes and invoices from
// it, the field doesn't need it.
services.get('/', zValidator('query', listServicesQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getServices(
      db,
      c.req.valid('query'),
      isBackOfficeTier(c.get('user')),
      c.env.IMAGES_CDN_BASE_URL,
    ));
});

services.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await getServiceById(
    db,
    c.req.param('id'),
    isBackOfficeTier(c.get('user')),
    c.env.IMAGES_CDN_BASE_URL,
  );
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(row);
});

// Writes are admin-tier (owner/admin) — office never edits the catalog.
services.post('/', requireRole(['owner', 'admin']), zValidator('json', createServiceSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  try {
    return c.json(await createService(db, c.req.valid('json'), c.env.IMAGES_CDN_BASE_URL), 201);
  } catch (err) {
    if (err instanceof ServiceCodeInUseError) return codeInUse(c, err);
    throw err;
  }
});

services.patch(
  '/:id',
  requireRole(['owner', 'admin']),
  zValidator('json', updateServiceSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const row = await editService(db, c.req.param('id'), c.req.valid('json'), c.env.IMAGES_CDN_BASE_URL);
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    } catch (err) {
      if (err instanceof ServiceCodeInUseError) return codeInUse(c, err);
      throw err;
    }
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
