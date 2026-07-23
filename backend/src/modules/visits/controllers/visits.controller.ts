import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { isForeignKeyViolation } from '../../database/db-errors';
import {
  assignVisitSchema,
  changeVisitStatusSchema,
  createVisitSchema,
  listVisitsQuerySchema,
  updateVisitSchema,
} from '../validators/visits.validator';
import {
  assignVisit,
  changeVisitStatus,
  createVisit,
  editVisit,
  getVisitById,
  getVisits,
} from '../services/visits.service';
import {
  InvalidVisitStatusTransitionError,
  InvalidVisitWindowError,
  TechSwapNotAllowedError,
  VisitNotReassignableError,
} from '../http-errors/visits.error';

export const visits = new Hono<AppBindings>();

// The whole team sees the calendar (technicians read-only, 12-calendar §2) —
// reads are open to any authenticated user.
visits.get('/', zValidator('query', listVisitsQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json({ visits: await getVisits(db, c.req.valid('query')) });
});

visits.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const visit = await getVisitById(db, c.req.param('id'));
  if (!visit) return c.json({ error: 'not_found' }, 404);
  return c.json({ visit });
});

// Scheduling writes are staff-only (owner/admin/office).
visits.post(
  '/',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', createVisitSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const visit = await createVisit(db, c.req.valid('json'), c.get('user').id);
      return c.json({ visit }, 201);
    } catch (err) {
      if (err instanceof InvalidVisitWindowError) {
        return c.json({ error: 'invalid_window', message: err.message }, 400);
      }
      if (isForeignKeyViolation(err)) return c.json({ error: 'invalid_reference' }, 422);
      throw err;
    }
  },
);

visits.patch(
  '/:id',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', updateVisitSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const visit = await editVisit(db, c.req.param('id'), c.req.valid('json'));
      if (!visit) return c.json({ error: 'not_found' }, 404);
      return c.json({ visit });
    } catch (err) {
      if (err instanceof InvalidVisitWindowError) {
        return c.json({ error: 'invalid_window', message: err.message }, 400);
      }
      if (isForeignKeyViolation(err)) return c.json({ error: 'invalid_reference' }, 422);
      throw err;
    }
  },
);

// Reassignment — the audited path. Technicians are admitted for the §2a swap;
// the service enforces they can only hand off their own visit.
visits.post('/:id/assign', zValidator('json', assignVisitSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  try {
    const visit = await assignVisit(db, c.req.param('id'), c.req.valid('json'), c.get('user'));
    if (!visit) return c.json({ error: 'not_found' }, 404);
    return c.json({ visit });
  } catch (err) {
    if (err instanceof TechSwapNotAllowedError) {
      return c.json({ error: 'swap_not_allowed', message: err.message }, 403);
    }
    if (err instanceof VisitNotReassignableError) {
      return c.json({ error: 'visit_not_reassignable', message: err.message }, 409);
    }
    if (isForeignKeyViolation(err)) return c.json({ error: 'invalid_reference' }, 422);
    throw err;
  }
});

visits.post(
  '/:id/status',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', changeVisitStatusSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const visit = await changeVisitStatus(db, c.req.param('id'), c.req.valid('json'));
      if (!visit) return c.json({ error: 'not_found' }, 404);
      return c.json({ visit });
    } catch (err) {
      if (err instanceof InvalidVisitStatusTransitionError) {
        return c.json({ error: 'invalid_transition', message: err.message }, 409);
      }
      throw err;
    }
  },
);
