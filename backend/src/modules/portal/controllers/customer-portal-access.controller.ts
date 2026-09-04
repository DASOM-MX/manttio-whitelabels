import { Hono } from 'hono';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { BACK_OFFICE_TIER } from '../../auth/utils/role-tier';
import { findCustomerById } from '../../customers/repository/customers.repository';
import { getCustomerContactsPortalAccess } from '../services/portal-users.service';
import { UUID_PARAM } from '../../shared/constants/uuid-param';

/**
 * `GET /customers/:id/portal-access` (superadmin 26 §6, CP-5) — one
 * customer's live contacts, each carrying its portal-access state, for the
 * customer detail page's per-contact indicator.
 *
 * Lives in the **portal** module and is mounted onto the customers path in
 * `index.ts`, mirroring `customer-quotations.controller.ts`: the module that
 * owns the data owns the route.
 *
 * `BACK_OFFICE_TIER` (owner, admin, office) — it matches every other
 * `/customers` read, so the indicator is visible to everyone who can already
 * open the page and see these contacts (owner 2026-09-04). Still narrower
 * than it looks next to owner-only `GET /portal-users` (26 CP-1): that route
 * is the tenant-wide roster of every external person with access to the
 * tenant's documents, while this one is scoped to a single customer and says
 * only whether each contact can log in.
 */
export const customerPortalAccess = new Hono<AppBindings>();

customerPortalAccess.get(
  `/:id{${UUID_PARAM}}/portal-access`,
  requireRole(BACK_OFFICE_TIER),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const id = c.req.param('id');
    // 404 on an unknown (or soft-deleted) customer rather than an empty list —
    // same posture as GET /customers/:id/quotations.
    const customer = await findCustomerById(db, id);
    if (!customer) return c.json({ error: 'not_found' }, 404);

    return c.json(await getCustomerContactsPortalAccess(db, id));
  },
);
