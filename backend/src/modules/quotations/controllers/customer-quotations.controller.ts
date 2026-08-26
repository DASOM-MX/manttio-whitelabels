import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { findCustomerById } from '../../customers/repository/customers.repository';
import { customerQuotationsQuerySchema } from '../validators/quotations.validator';
import { getQuotations } from '../services/quotations.service';
import { UUID_PARAM } from '../../shared/constants/uuid-param';

/** `GET /customers/:id/quotations` (20 §9) — the client's quotations, for the
 *  customer view's card.
 *
 *  Lives in the **quotations** module and is mounted onto the customers path in
 *  `index.ts`, rather than being added to the customers controller: quotations
 *  already imports from customers (contacts, for the recipient check), so
 *  wiring it the other way round would make the two modules circular. The
 *  module that owns the data owns the route.
 *
 *  Same role gate as the rest of the module — office and up, never technicians. */
export const customerQuotations = new Hono<AppBindings>();

customerQuotations.get(
  `/:id{${UUID_PARAM}}/quotations`,
  requireRole(['owner', 'admin', 'office']),
  zValidator('query', customerQuotationsQuerySchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const id = c.req.param('id');
    // 404 on an unknown (or soft-deleted) client rather than an empty list: the
    // caller asked about a specific customer, and "no quotes" and "no such
    // customer" are different answers.
    const customer = await findCustomerById(db, id);
    if (!customer) return c.json({ error: 'not_found' }, 404);
    const { page, limit } = c.req.valid('query');
    return c.json(await getQuotations(db, { customerId: id, page, limit }));
  },
);
