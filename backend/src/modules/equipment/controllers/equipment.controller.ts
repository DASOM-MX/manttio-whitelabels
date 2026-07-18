import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import {
  createEquipmentSchema,
  deleteEquipmentSchema,
  linkReportSchema,
  listEquipmentQuerySchema,
  updateEquipmentSchema,
} from '../validators/equipment.validator';
import {
  createEquipment,
  editEquipment,
  getEquipment,
  getEquipmentById,
  linkReportToEquipment,
  removeEquipment,
  unlinkReportFromEquipment,
} from '../services/equipment.service';
import { ReportCustomerMismatchError } from '../http-errors/equipment.error';

export const equipment = new Hono<AppBindings>();

// Reads are open to any authenticated user; the global list is paged (11 §4).
equipment.get('/', zValidator('query', listEquipmentQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getEquipment(db, c.req.valid('query')));
});

equipment.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await getEquipmentById(db, c.req.param('id'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(row);
});

// Writes are admin-tier (owner/admin).
equipment.post('/', requireRole(['owner', 'admin']), zValidator('json', createEquipmentSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await createEquipment(db, c.req.valid('json'));
  return c.json(row, 201);
});

equipment.patch(
  '/:id',
  requireRole(['owner', 'admin']),
  zValidator('json', updateEquipmentSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const row = await editEquipment(db, c.req.param('id'), c.req.valid('json'));
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(row);
  },
);

equipment.delete(
  '/:id',
  requireRole(['owner', 'admin']),
  zValidator('json', deleteEquipmentSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const { deleteComment } = c.req.valid('json');
    const row = await removeEquipment(db, c.req.param('id'), deleteComment, c.get('user').id);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ id: row.id, deleted: true });
  },
);

// --- Report linkage (11 §2) — retro-link / unlink ---------------------------
// Bind: PUT is idempotent ("ensure this report is linked"); the equipment id is
// the path, the report id the body. Unbind carries the report id in the path (a
// DELETE identifies the resource by URL and takes no body).

equipment.put(
  '/:id/reports',
  requireRole(['owner', 'admin']),
  zValidator('json', linkReportSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const row = await linkReportToEquipment(db, c.req.param('id'), c.req.valid('json').reportId);
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    } catch (err) {
      if (err instanceof ReportCustomerMismatchError) {
        return c.json({ error: 'report_customer_mismatch', message: err.message }, 400);
      }
      throw err;
    }
  },
);

equipment.delete('/:id/reports/:reportId', requireRole(['owner', 'admin']), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await unlinkReportFromEquipment(db, c.req.param('id'), c.req.param('reportId'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(row);
});
