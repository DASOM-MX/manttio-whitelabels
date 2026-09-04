import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { UUID_PARAM } from '../../shared/constants/uuid-param';
import { PortalGrant } from '../enums/portal-grants.enum';
import { requireAnyGrant } from '../middleware/portal-grant.middleware';
import { portalJwtMiddleware } from '../middleware/portal-jwt.middleware';
import {
  getEquipmentForPortal,
  listEquipmentForPortal,
} from '../services/portal-equipment.service';
import { portalEquipmentQuerySchema } from '../validators/portal-reads.validator';

// Equipos (04 §7, A8) — the only route in the surface guarded by a
// **disjunction**: `view_equipment` opens the browsable section, and a user who
// holds only `create_service_requests` reaches the same endpoint as the request
// form's picker. Each sub-list on the detail obeys its own grant.
export const portalEquipment = new Hono<AppBindings>();

portalEquipment.use('*', portalJwtMiddleware);
portalEquipment.use(
  '*',
  requireAnyGrant(PortalGrant.ViewEquipment, PortalGrant.CreateServiceRequests),
);

portalEquipment.get('/', zValidator('query', portalEquipmentQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = c.get('portalUser');
  return c.json(await listEquipmentForPortal(db, user.customerId, c.req.valid('query')));
});

portalEquipment.get(`/:id{${UUID_PARAM}}`, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = c.get('portalUser');
  const unit = await getEquipmentForPortal(
    db,
    user.customerId,
    user.grants,
    c.req.param('id'),
  );
  if (!unit) return c.json({ error: 'not_found' }, 404);
  return c.json(unit);
});
