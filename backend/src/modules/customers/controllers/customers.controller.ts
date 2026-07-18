import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { createCustomerSchema, updateCustomerSchema } from '../validators/customers.validator';
import {
  addInteractionSchema,
  changeStatusSchema,
  listInteractionsQuerySchema,
} from '../validators/interactions.validator';
import {
  createCustomer,
  editCustomer,
  getCustomerById,
  getCustomers,
  removeCustomer,
} from '../services/customers.service';
import {
  addInteraction,
  changeCustomerStatus,
  getInteractions,
} from '../services/interactions.service';
import { getCustomerEquipment } from '../../equipment/services/equipment.service';
import { getCustomerReports } from '../../reports/services/reports.service';
import {
  BlacklistReasonRequiredError,
  InvalidStatusTransitionError,
} from '../http-errors/status-change.error';

export const customers = new Hono<AppBindings>();

// Read endpoints are open to any authenticated user (admins + technicians).
customers.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json({ customers: await getCustomers(db) });
});

customers.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await getCustomerById(db, c.req.param('id'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ customer: row });
});

// Write endpoints are admin-only.
customers.post('/', requireRole(['owner', 'admin']), zValidator('json', createCustomerSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await createCustomer(db, c.req.valid('json'), c.get('user').id);
  return c.json({ customer: row }, 201);
});

customers.patch(
  '/:id',
  requireRole(['owner', 'admin']),
  zValidator('json', updateCustomerSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const row = await editCustomer(db, c.req.param('id'), c.req.valid('json'), c.get('user').id);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ customer: row });
  },
);

customers.delete('/:id', requireRole(['owner', 'admin']), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await removeCustomer(db, c.req.param('id'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ id: row.id, deleted: true });
});

// --- Customer sub-resources (equipment 11, reports 06) ------------------------

// The client's installed units (11 §4) — the daily entry point (the customer
// card). Reading is open to any authenticated user.
customers.get('/:id/equipment', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getCustomerEquipment(db, c.req.param('id')));
});

// The client's service reports (06) — the customer 360 "Servicios" tab and the
// equipment retro-link picker. Compact, technician-named, newest-first.
customers.get('/:id/reports', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getCustomerReports(db, c.req.param('id')));
});

// --- CRM sub-resources (08) ---------------------------------------------------

// Activity timeline (08 §2). Reading is open to any authenticated user; the
// paged list is newest-first.
customers.get('/:id/interactions', zValidator('query', listInteractionsQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const { page, limit } = c.req.valid('query');
  const { items, total } = await getInteractions(db, c.req.param('id'), page, limit);
  return c.json({ items, total, page, limit });
});

// Log a manual touch (call/whatsapp/email/visit/note). `system` is rejected by
// the schema. The author is the authenticated user.
customers.post(
  '/:id/interactions',
  requireRole(['owner', 'admin']),
  zValidator('json', addInteractionSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const entry = await addInteraction(db, c.req.param('id'), c.req.valid('json'), c.get('user').id);
    if (!entry) return c.json({ error: 'not_found' }, 404);
    return c.json(entry, 201);
  },
);

// Dedicated status transition (08 §1/§4): enforces the legal transition + the
// blacklist-reason rule and emits the `system` timeline entry server-side.
customers.post(
  '/:id/status',
  requireRole(['owner', 'admin']),
  zValidator('json', changeStatusSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const row = await changeCustomerStatus(
        db,
        c.req.param('id'),
        c.req.valid('json'),
        c.get('user').id,
      );
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json({ customer: row });
    } catch (err) {
      if (err instanceof InvalidStatusTransitionError) {
        return c.json({ error: 'invalid_transition', message: err.message }, 409);
      }
      if (err instanceof BlacklistReasonRequiredError) {
        return c.json({ error: 'blacklist_reason_required', message: err.message }, 400);
      }
      throw err;
    }
  },
);
