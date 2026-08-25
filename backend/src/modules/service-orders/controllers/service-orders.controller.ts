import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { getServiceOrderContracts } from '../../contracts/services/contracts.service';
import {
  createServiceOrderSchema,
  listServiceOrdersQuerySchema,
  listTimelineQuerySchema,
  setServiceOrderStatusSchema,
  updateServiceOrderSchema,
} from '../validators/service-orders.validator';
import {
  addServiceOrder,
  editServiceOrder,
  getServiceOrderById,
  getServiceOrderReports,
  getServiceOrderTimeline,
  getServiceOrders,
  setServiceOrderStatus,
} from '../services/service-orders.service';
import {
  InvalidOrderReferenceError,
  InvalidOrderTransitionError,
  InvalidTemplateError,
  LocationEditForbiddenError,
  OrderClosedError,
  ReopenForbiddenError,
} from '../http-errors/service-orders.error';

export const serviceOrders = new Hono<AppBindings>();

// The PK is a uuid, so a malformed :id can never match a row — 404 it up front
// rather than letting Postgres throw 22P02 into a 500 (backend/CLAUDE.md,
// same idiom as notifications/cms).
const idSchema = z.string().uuid();

// Reads are open to any authenticated user: a technician opening an assigned
// report needs the order header for context (19 §3). The service layer strips
// every money field for them.
serviceOrders.get('/', zValidator('query', listServiceOrdersQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getServiceOrders(db, c.get('user'), c.req.valid('query')));
});

serviceOrders.get('/:id', async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  const order = await getServiceOrderById(db, c.get('user'), id.data);
  if (!order) return c.json({ error: 'not_found' }, 404);
  return c.json({ order });
});

// The exploded reports, lazy-loaded by the order view's reports card (decided
// 2026-07-27) — not embedded in the detail read. Unpaged: the explosion caps
// bound this at 50 rows.
serviceOrders.get('/:id/reports', async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  const reports = await getServiceOrderReports(db, id.data);
  if (!reports) return c.json({ error: 'not_found' }, 404);
  return c.json({ reports });
});

// The contracts this job generated (13 §2, 0..n) — the order view's
// "Contratos" card. Role-scoped, unpaged, newest-first.
serviceOrders.get('/:id/contracts', async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  const contracts = await getServiceOrderContracts(db, id.data, c.get('user'));
  return c.json({ contracts });
});

// The order timeline (19 §7) — paged newest-first (decided 2026-07-27), the
// same feed idiom as customer interactions. The CP-5 handoff document composes
// from its own full internal read, so paging here costs the audit nothing.
serviceOrders.get('/:id/timeline', zValidator('query', listTimelineQuerySchema), async (c) => {
  const id = idSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'not_found' }, 404);
  const db = createDb(c.env.DATABASE_URL);
  const { page, limit } = c.req.valid('query');
  const timeline = await getServiceOrderTimeline(db, id.data, page, limit);
  if (!timeline) return c.json({ error: 'not_found' }, 404);
  return c.json(timeline);
});

// Booking work is the back office's day job, so office is in — technicians are
// not (19 §3). The §2 transaction runs behind this: folio, price-frozen lines,
// one exploded `pending` report per sold unit, the opening timeline entries and
// the customer's CRM entry, all or nothing.
serviceOrders.post(
  '/',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', createServiceOrderSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const order = await addServiceOrder(db, c.get('user'), c.req.valid('json'));
      return c.json({ order }, 201);
    } catch (err) {
      if (err instanceof InvalidOrderReferenceError) {
        return c.json({ error: 'invalid_reference', message: err.message }, 422);
      }
      if (err instanceof InvalidTemplateError) {
        return c.json({ error: 'invalid_template', message: err.message }, 400);
      }
      throw err;
    }
  },
);

// The mutable logistics metadata only — comments, priority, promisedDate (any
// staff) and/or location (owner/admin, the service enforces it); everything
// else is fixed at creation (19 §1), and only while the order is open (decided
// 2026-07-29).
serviceOrders.patch(
  '/:id',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', updateServiceOrderSchema),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const db = createDb(c.env.DATABASE_URL);
    try {
      const order = await editServiceOrder(db, c.get('user'), id.data, c.req.valid('json'));
      if (!order) return c.json({ error: 'not_found' }, 404);
      return c.json({ order });
    } catch (err) {
      if (err instanceof LocationEditForbiddenError) {
        return c.json({ error: 'forbidden_location_edit', message: err.message }, 403);
      }
      if (err instanceof OrderClosedError) {
        return c.json({ error: 'order_closed', message: err.message }, 409);
      }
      throw err;
    }
  },
);

// Complete, cancel, or — since CP-2b — reopen (19 §2). Cancelling voids the
// order's unfinished reports and is terminal; `open` moves a completed order
// back (owner/admin only, gated in the service).
serviceOrders.post(
  '/:id/status',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', setServiceOrderStatusSchema),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const db = createDb(c.env.DATABASE_URL);
    try {
      const order = await setServiceOrderStatus(db, c.get('user'), id.data, c.req.valid('json'));
      if (!order) return c.json({ error: 'not_found' }, 404);
      return c.json({ order });
    } catch (err) {
      if (err instanceof InvalidOrderTransitionError) {
        return c.json({ error: 'invalid_status_transition', message: err.message }, 409);
      }
      if (err instanceof ReopenForbiddenError) {
        return c.json({ error: 'forbidden_reopen', message: err.message }, 403);
      }
      throw err;
    }
  },
);
