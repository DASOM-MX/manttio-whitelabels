import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import {
  createServiceOrderSchema,
  listServiceOrdersQuerySchema,
  setServiceOrderStatusSchema,
  updateServiceOrderSchema,
} from '../validators/service-orders.validator';
import {
  addServiceOrder,
  editServiceOrder,
  getServiceOrderById,
  getServiceOrderTimeline,
  getServiceOrders,
  setServiceOrderStatus,
} from '../services/service-orders.service';
import {
  InvalidOrderReferenceError,
  InvalidOrderTransitionError,
  LocationEditForbiddenError,
} from '../http-errors/service-orders.error';

export const serviceOrders = new Hono<AppBindings>();

// Reads are open to any authenticated user: a technician opening an assigned
// report needs the order header for context (19 §3). The service layer strips
// every money field for them.
serviceOrders.get('/', zValidator('query', listServiceOrdersQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const { page, limit } = c.req.valid('query');
  const { items, total } = await getServiceOrders(db, c.get('user'), c.req.valid('query'));
  return c.json({ items, total, page, limit });
});

serviceOrders.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const order = await getServiceOrderById(db, c.get('user'), c.req.param('id'));
  if (!order) return c.json({ error: 'not_found' }, 404);
  return c.json({ order });
});

// The order timeline (19 §7) — oldest-first, unpaged: it reads as a story and
// becomes the client handoff document, so a partial history won't do.
serviceOrders.get('/:id/timeline', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const events = await getServiceOrderTimeline(db, c.req.param('id'));
  if (!events) return c.json({ error: 'not_found' }, 404);
  return c.json({ events });
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
      throw err;
    }
  },
);

// `comments` and/or `location` only — everything else is fixed at creation
// (19 §1). `location` is owner/admin-only and the service enforces it.
serviceOrders.patch(
  '/:id',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', updateServiceOrderSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const order = await editServiceOrder(
        db,
        c.get('user'),
        c.req.param('id'),
        c.req.valid('json'),
      );
      if (!order) return c.json({ error: 'not_found' }, 404);
      return c.json({ order });
    } catch (err) {
      if (err instanceof LocationEditForbiddenError) {
        return c.json({ error: 'forbidden_location_edit', message: err.message }, 403);
      }
      throw err;
    }
  },
);

// Complete or cancel (19 §2). Cancelling voids the order's unfinished reports;
// both moves are one-way in v1.
serviceOrders.post(
  '/:id/status',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', setServiceOrderStatusSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const order = await setServiceOrderStatus(
        db,
        c.get('user'),
        c.req.param('id'),
        c.req.valid('json'),
      );
      if (!order) return c.json({ error: 'not_found' }, 404);
      return c.json({ order });
    } catch (err) {
      if (err instanceof InvalidOrderTransitionError) {
        return c.json({ error: 'invalid_status_transition', message: err.message }, 409);
      }
      throw err;
    }
  },
);
