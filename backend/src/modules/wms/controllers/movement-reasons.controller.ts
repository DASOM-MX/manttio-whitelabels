import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppBindings } from '../../../env';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { createDb } from '../../database/client';
import { movementReasonErrorResponse } from '../http-errors/movement-reasons.error-response';
import {
  createMovementReason,
  editMovementReason,
  getMovementReasons,
} from '../services/movement-reasons.service';
import {
  createMovementReasonSchema,
  updateMovementReasonSchema,
} from '../validators/movement-reasons.validator';

// Movement reasons (10-wms/02 §5). CRUD minus delete — and the missing D is
// structural, not an omission: `movements.reason` FKs `code`, so a removed
// reason would orphan history. Retirement is `active: false`.
export const movementReasons = new Hono<AppBindings>();

const idSchema = z.string().uuid();

const reasonWriteRoles = requireRole(['owner', 'admin']);

/** Any authenticated role: every stock dialog needs the list to render a
 *  select, and every history row needs it to render a label. */
movementReasons.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getMovementReasons(db));
});

movementReasons.post(
  '/',
  reasonWriteRoles,
  zValidator('json', createMovementReasonSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    return c.json(await createMovementReason(db, c.req.valid('json')), 201);
  },
);

movementReasons.patch(
  '/:id',
  reasonWriteRoles,
  zValidator('json', updateMovementReasonSchema),
  async (c) => {
    const id = idSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const db = createDb(c.env.DATABASE_URL);
    try {
      const row = await editMovementReason(db, id.data, c.req.valid('json'));
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    } catch (err) {
      return movementReasonErrorResponse(c, err);
    }
  },
);
