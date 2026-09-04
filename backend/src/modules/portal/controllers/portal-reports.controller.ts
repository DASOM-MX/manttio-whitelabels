import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { REPORT_ID_PARAM } from '../../shared/constants/report-id-param';
import { PortalGrant } from '../enums/portal-grants.enum';
import { requireGrant } from '../middleware/portal-grant.middleware';
import { portalJwtMiddleware } from '../middleware/portal-jwt.middleware';
import {
  downloadReportForPortal,
  getReportForPortal,
  listReportsForPortal,
} from '../services/portal-reports.service';
import { portalReportsQuerySchema } from '../validators/portal-reads.validator';

// Reportes (04 §3). The scope is the token's `customerId` on every route — a
// report belonging to another customer is absent from the list and 404s on
// direct access (02 §4).
export const portalReports = new Hono<AppBindings>();

portalReports.use('*', portalJwtMiddleware);
portalReports.use('*', requireGrant(PortalGrant.ViewReports));

portalReports.get('/', zValidator('query', portalReportsQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = c.get('portalUser');
  return c.json(await listReportsForPortal(db, user.customerId, c.req.valid('query')));
});

// The same renderer staff use, brand-driven. Every fetch appends a
// `report_events` row inside the transaction that clears it (04 §2b).
portalReports.get(`/:id{${REPORT_ID_PARAM}}/pdf`, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = c.get('portalUser');
  const rendered = await downloadReportForPortal(
    db,
    c.env.LOGOS_CDN_BASE_URL,
    user,
    c.req.param('id'),
  );
  if (!rendered) return c.json({ error: 'not_found' }, 404);

  return new Response(rendered.pdf, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${rendered.id}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
});

portalReports.get(`/:id{${REPORT_ID_PARAM}}`, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = c.get('portalUser');
  const report = await getReportForPortal(db, user.customerId, c.req.param('id'));
  if (!report) return c.json({ error: 'not_found' }, 404);
  return c.json(report);
});
