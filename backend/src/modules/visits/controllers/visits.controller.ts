import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { VISIT_STAFF_ROLES } from '../constants/staff-roles';
import { VISIT_ACTOR_ROLES } from '../constants/visit-actor-roles';
import { VISIT_ACTUALS_ROLES } from '../constants/visit-actuals-roles';
import { visitErrorResponse } from '../http-errors/visits.error-response';
import {
  assignVisitSchema,
  closeVisitSchema,
  correctActualsSchema,
  correctVisitSchema,
  createVisitSchema,
  listVisitsQuerySchema,
  rescheduleVisitSchema,
  respondVisitSchema,
  startVisitSchema,
} from '../validators/visits.validator';
import {
  assignVisit,
  closeVisit,
  correctVisit,
  correctVisitActuals,
  createVisit,
  getVisitById,
  getVisits,
  respondVisit,
  rescheduleVisit,
  startVisit,
} from '../services/visits.service';
import { streamVisitEvents } from '../services/visits-stream.service';

export const visits = new Hono<AppBindings>();

// Reads are open to every authenticated role: technicians see the full team
// calendar read-only (12 §2), which is the point of a *team* calendar.
visits.get('/', zValidator('query', listVisitsQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getVisits(db, c.req.valid('query')));
});

// Live visit delivery (12 CP-4) — session-length per-connection SSE, the
// notifications-stream posture (Bearer-authed by the mounted JWT middleware;
// the frontend consumes it with the fetch-based reader since EventSource
// can't set the Authorization header). Staff-gated: v1's only consumer is
// the superadmin calendar — the field app stays offline-first pull.
// Registered before `/:id` so "stream" never matches as an id.
visits.get('/stream', requireRole(VISIT_STAFF_ROLES), (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return streamSSE(c, (stream) => streamVisitEvents(db, stream));
});

visits.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const visit = await getVisitById(db, c.req.param('id'));
  if (!visit) return c.json({ error: 'not_found' }, 404);
  return c.json(visit);
});

visits.post('/', requireRole(VISIT_STAFF_ROLES), zValidator('json', createVisitSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  try {
    return c.json(await createVisit(db, c.req.valid('json'), c.get('user').id), 201);
  } catch (err) {
    return visitErrorResponse(c, err);
  }
});

// Correction of an open visit — scheduling fields only. Reassignment is
// `/assign` and status changes are the lifecycle routes; neither is reachable
// from here (12 §5).
visits.patch(
  '/:id',
  requireRole(VISIT_STAFF_ROLES),
  zValidator('json', correctVisitSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const visit = await correctVisit(
        db,
        c.req.param('id'),
        c.req.valid('json'),
        c.get('user').id,
      );
      if (!visit) return c.json({ error: 'not_found' }, 404);
      return c.json(visit);
    } catch (err) {
      return visitErrorResponse(c, err);
    }
  },
);

// Technicians are admitted here for the §2a swap: the service checks the visit
// is currently theirs, so they can give one away but never take one.
visits.post(
  '/:id/assign',
  requireRole(VISIT_ACTOR_ROLES),
  zValidator('json', assignVisitSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const visit = await assignVisit(db, c.req.param('id'), c.req.valid('json'), c.get('user'));
      if (!visit) return c.json({ error: 'not_found' }, 404);
      return c.json(visit);
    } catch (err) {
      return visitErrorResponse(c, err);
    }
  },
);

// Iniciar. The technician's own action, so the same actor gate as respond/close
// — the service additionally requires the visit to be theirs.
visits.post(
  '/:id/start',
  requireRole(VISIT_ACTOR_ROLES),
  zValidator('json', startVisitSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const visit = await startVisit(db, c.req.param('id'), c.req.valid('json'), c.get('user'));
      if (!visit) return c.json({ error: 'not_found' }, 404);
      return c.json(visit);
    } catch (err) {
      return visitErrorResponse(c, err);
    }
  },
);

visits.post(
  '/:id/respond',
  requireRole(VISIT_ACTOR_ROLES),
  zValidator('json', respondVisitSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const visit = await respondVisit(db, c.req.param('id'), c.req.valid('json'), c.get('user'));
      if (!visit) return c.json({ error: 'not_found' }, 404);
      return c.json(visit);
    } catch (err) {
      return visitErrorResponse(c, err);
    }
  },
);

// The narrowest gate in the module: **owner/admin only**, not office. Rewriting
// what a technician recorded as done is a billing-grade edit (12 §2).
visits.patch(
  '/:id/actuals',
  requireRole(VISIT_ACTUALS_ROLES),
  zValidator('json', correctActualsSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const visit = await correctVisitActuals(
        db,
        c.req.param('id'),
        c.req.valid('json'),
        c.get('user').id,
      );
      if (!visit) return c.json({ error: 'not_found' }, 404);
      return c.json(visit);
    } catch (err) {
      return visitErrorResponse(c, err);
    }
  },
);

visits.post(
  '/:id/close',
  requireRole(VISIT_ACTOR_ROLES),
  zValidator('json', closeVisitSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const visit = await closeVisit(db, c.req.param('id'), c.req.valid('json'), c.get('user'));
      if (!visit) return c.json({ error: 'not_found' }, 404);
      return c.json(visit);
    } catch (err) {
      return visitErrorResponse(c, err);
    }
  },
);

// Returns the **successor** (201), not the closed visit it replaces — the
// caller's next screen is the new appointment.
visits.post(
  '/:id/reschedule',
  requireRole(VISIT_ACTOR_ROLES),
  zValidator('json', rescheduleVisitSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const visit = await rescheduleVisit(
        db,
        c.req.param('id'),
        c.req.valid('json'),
        c.get('user'),
      );
      if (!visit) return c.json({ error: 'not_found' }, 404);
      return c.json(visit, 201);
    } catch (err) {
      return visitErrorResponse(c, err);
    }
  },
);
