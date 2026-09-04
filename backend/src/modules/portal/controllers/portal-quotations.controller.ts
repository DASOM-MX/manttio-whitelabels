import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { UUID_PARAM } from '../../shared/constants/uuid-param';
import { PortalGrant } from '../enums/portal-grants.enum';
import { requireGrant } from '../middleware/portal-grant.middleware';
import { portalJwtMiddleware } from '../middleware/portal-jwt.middleware';
import {
  downloadQuotationForPortal,
  getQuotationForPortal,
  listQuotationsForPortal,
} from '../services/portal-quotations.service';
import { portalQuotationsQuerySchema } from '../validators/portal-reads.validator';

// Cotizaciones (04 §5), read-only. The in-portal decision is 05's route and is
// gated by `approve_quotations`, not by this controller's grant.
export const portalQuotations = new Hono<AppBindings>();

portalQuotations.use('*', portalJwtMiddleware);
portalQuotations.use('*', requireGrant(PortalGrant.ViewQuotations));

portalQuotations.get('/', zValidator('query', portalQuotationsQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = c.get('portalUser');
  return c.json(await listQuotationsForPortal(db, user.customerId, c.req.valid('query')));
});

// The same document the send attaches. Every fetch appends a
// `quotation_downloaded` row inside the transaction that clears it (04 §2b).
portalQuotations.get(`/:id{${UUID_PARAM}}/pdf`, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = c.get('portalUser');
  const rendered = await downloadQuotationForPortal(db, c.env, user, c.req.param('id'));
  if (!rendered) return c.json({ error: 'not_found' }, 404);

  return new Response(rendered.bytes, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${rendered.filename}"`,
      'cache-control': 'private, no-store',
    },
  });
});

portalQuotations.get(`/:id{${UUID_PARAM}}`, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = c.get('portalUser');
  const quotation = await getQuotationForPortal(db, user.customerId, c.req.param('id'));
  if (!quotation) return c.json({ error: 'not_found' }, 404);
  return c.json(quotation);
});
