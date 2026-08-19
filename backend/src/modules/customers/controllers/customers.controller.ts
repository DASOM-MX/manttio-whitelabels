import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import {
  createCustomerSchema,
  recentCustomersQuerySchema,
  updateCustomerSchema,
} from '../validators/customers.validator';
import {
  followUpsQuerySchema,
  intakeStatsQuerySchema,
  intakeTrendQuerySchema,
} from '../validators/customer-stats.validator';
import {
  addInteractionSchema,
  changeStatusSchema,
  listInteractionsQuerySchema,
  recentInteractionsQuerySchema,
} from '../validators/interactions.validator';
import {
  createCustomer,
  editCustomer,
  getCustomerById,
  getCustomers,
  getRecentCustomers,
  removeCustomer,
} from '../services/customers.service';
import {
  addInteraction,
  changeCustomerStatus,
  getInteractions,
  getRecentInteractions,
} from '../services/interactions.service';
import { getFollowUps, getIntakeStats, getIntakeTrend } from '../services/customer-stats.service';
import { getCustomerEquipment } from '../../equipment/services/equipment.service';
import { getCustomerReports } from '../../reports/services/reports.service';
import { getCustomerContracts } from '../../contracts/services/contracts.service';
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

// Intake stats for the CRM dashboard (utm-params 03): leads/actives per
// source, requested month (MTD when current) vs the full previous month.
// Declared before GET /:id so "stats" is never captured as an id. Office
// admitted 2026-07-20 — the gate matches the Clientes module set.
customers.get(
  '/stats/intake',
  requireRole(['owner', 'admin', 'office']),
  zValidator('query', intakeStatsQuerySchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    return c.json(await getIntakeStats(db, c.req.valid('query').month));
  },
);

// Monthly intake series for the dashboard trend chart (CRM dashboard
// redesign 2026-07-22). Same gate + placement rules as /stats/intake.
customers.get(
  '/stats/trend',
  requireRole(['owner', 'admin', 'office']),
  zValidator('query', intakeTrendQuerySchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    return c.json(await getIntakeTrend(db, c.req.valid('query').months));
  },
);

// Follow-up agenda + overdue/scheduled counts for the dashboard (CRM
// dashboard redesign 2026-07-22). Declared before GET /:id.
customers.get(
  '/follow-ups',
  requireRole(['owner', 'admin', 'office']),
  zValidator('query', followUpsQuerySchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    return c.json(await getFollowUps(db, c.req.valid('query').limit));
  },
);

// Latest registered clients (utm-params 03 amendment 2026-07-20): the
// dashboard's recent-clients card. Newest first; also before GET /:id.
customers.get(
  '/recent',
  requireRole(['owner', 'admin', 'office']),
  zValidator('query', recentCustomersQuerySchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const { limit } = c.req.valid('query');
    return c.json({ items: await getRecentCustomers(db, limit) });
  },
);

// Tenant-wide latest activity across clients (utm-params 03 amendment
// 2026-07-20). Technicians keep only the per-customer read below.
customers.get(
  '/interactions/recent',
  requireRole(['owner', 'admin', 'office']),
  zValidator('query', recentInteractionsQuerySchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const { limit } = c.req.valid('query');
    return c.json({ items: await getRecentInteractions(db, limit) });
  },
);

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
  const row = await removeCustomer(db, c.req.param('id'), c.get('user').id);
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

// The client's filed contracts (13 §6) — the customer 360 "Contratos" card.
// Role-scoped: office/technician see only the contracts whose `visibleToRoles`
// admits them.
customers.get('/:id/contracts', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const contracts = await getCustomerContracts(db, c.req.param('id'), c.get('user'));
  return c.json({ contracts });
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
// the schema. The author is the authenticated user; office staff log touches
// as part of their day job (owner, 2026-07-21 — was owner/admin).
customers.post(
  '/:id/interactions',
  requireRole(['owner', 'admin', 'office']),
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
