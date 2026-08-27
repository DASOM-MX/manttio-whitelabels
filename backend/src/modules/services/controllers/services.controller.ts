import { Hono, type Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { ServiceCodeInUseError, ServiceImportError } from '../http-errors/services.error';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { isBackOfficeTier } from '../../auth/utils/role-tier';
import { UUID_PARAM } from '../../shared/constants/uuid-param';
import {
  createServiceSchema,
  deleteServiceSchema,
  importServicesSchema,
  listServicesQuerySchema,
  updateServiceSchema,
} from '../validators/services.validator';
import {
  createService,
  editService,
  getServiceById,
  getServiceOptions,
  getServices,
  getServiceTimeline,
  importServices,
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

// The catalog browse — paged since 21 CP-5 (supersedes 18 §4's "no pagination",
// which CSV import made a matter of time), answering the one envelope every
// paged read answers. `page`/`limit` default to 1/10 and `limit` caps at 100,
// so this route can never be turned back into a full-table read; anything that
// genuinely needs the whole catalog uses `GET /services/all` below.
//
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

// The whole catalog for pickers (21 §3): a compact projection, unpaged by
// contract. Returns a bare array, not an envelope — there is no page, no limit,
// and a `total` could only ever be the array's own length (owner, 2026-08-25).
// Same back-office `cost` rule as GET / — the technician's response never
// carries the field, rather than carrying it for the client to hide.
services.get('/all', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getServiceOptions(db, isBackOfficeTier(c.get('user'))));
});

services.get(`/:id{${UUID_PARAM}}`, async (c) => {
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

// The audit trail is admin-tier, tighter than the catalog reads above: it
// carries `cost` old→new diffs and delete comments — management audit, not
// commercial visibility (18 §6.1). Office quotes from the catalog; it has no
// business in who repriced what.
services.get(`/:id{${UUID_PARAM}}/timeline`, requireRole(['owner', 'admin']), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const id = c.req.param('id');
  // Existence gate so an unknown id 404s rather than answering []. An empty
  // timeline is impossible for a live service (creation writes one row), and
  // a soft-deleted one is unreachable here like everywhere else — its trail
  // stays in the DB as the record.
  const row = await getServiceById(db, id, true);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(await getServiceTimeline(db, id));
});

// Writes are admin-tier (owner/admin) — office never edits the catalog.
services.post('/', requireRole(['owner', 'admin']), zValidator('json', createServiceSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  try {
    return c.json(
      await createService(db, c.req.valid('json'), c.get('user').id, c.env.IMAGES_CDN_BASE_URL),
      201,
    );
  } catch (err) {
    if (err instanceof ServiceCodeInUseError) return codeInUse(c, err);
    throw err;
  }
});

// CSV import (18 §6.3): all-or-nothing — any bad row rejects the whole file
// and the 422 names every failing row, so a partial import can never read as
// "imported everything".
services.post(
  '/import',
  requireRole(['owner', 'admin']),
  zValidator('json', importServicesSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      return c.json(
        await importServices(db, c.req.valid('json').rows, c.get('user').id),
        201,
      );
    } catch (err) {
      if (err instanceof ServiceImportError) {
        return c.json(
          {
            error: 'import_invalid',
            message: `El archivo tiene ${err.rows.length} fila(s) con errores.`,
            rows: err.rows,
          },
          422,
        );
      }
      throw err;
    }
  },
);

services.patch(
  `/:id{${UUID_PARAM}}`,
  requireRole(['owner', 'admin']),
  zValidator('json', updateServiceSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const row = await editService(
        db,
        c.req.param('id'),
        c.req.valid('json'),
        c.get('user').id,
        c.env.IMAGES_CDN_BASE_URL,
      );
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
  `/:id{${UUID_PARAM}}`,
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
