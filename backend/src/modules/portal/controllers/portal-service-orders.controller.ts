import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { UUID_PARAM } from '../../shared/constants/uuid-param';
import { PortalGrant } from '../enums/portal-grants.enum';
import { requireGrant } from '../middleware/portal-grant.middleware';
import { portalJwtMiddleware } from '../middleware/portal-jwt.middleware';
import {
  getServiceOrderForPortal,
  listServiceOrdersForPortal,
} from '../services/portal-service-orders.service';
import { portalServiceOrdersQuerySchema } from '../validators/portal-reads.validator';

// Órdenes de servicio (04 §6). No download route: the order is a detail page,
// not a document. The customer never sees `service_order_events`.
export const portalServiceOrders = new Hono<AppBindings>();

portalServiceOrders.use('*', portalJwtMiddleware);
portalServiceOrders.use('*', requireGrant(PortalGrant.ViewServiceOrders));

portalServiceOrders.get('/', zValidator('query', portalServiceOrdersQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = c.get('portalUser');
  return c.json(await listServiceOrdersForPortal(db, user.customerId, c.req.valid('query')));
});

portalServiceOrders.get(`/:id{${UUID_PARAM}}`, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = c.get('portalUser');
  const order = await getServiceOrderForPortal(db, user.customerId, c.req.param('id'));
  if (!order) return c.json({ error: 'not_found' }, 404);
  return c.json(order);
});
