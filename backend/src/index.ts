import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { AppBindings, Env } from './env';
import { createDb } from './modules/database/client';
import { sweepExpiredNotifications } from './modules/notifications/services/notifications-retention.service';
import { auth } from './modules/auth/controllers/auth.controller';
import { portalAuth } from './modules/portal/controllers/portal-auth.controller';
import { users } from './modules/users/controllers/users.controller';
import { customers } from './modules/customers/controllers/customers.controller';
import { reports } from './modules/reports/controllers/reports.controller';
import { equipment } from './modules/equipment/controllers/equipment.controller';
import { contracts } from './modules/contracts/controllers/contracts.controller';
import { reportTemplates } from './modules/report-templates/controllers/report-templates.controller';
import { upload } from './modules/upload/controllers/upload.controller';
import { cms } from './modules/cms/controllers/cms.controller';
import { notifications } from './modules/notifications/controllers/notifications.controller';
import { services } from './modules/services/controllers/services.controller';
import { quotations } from './modules/quotations/controllers/quotations.controller';
import { serviceOrders } from './modules/service-orders/controllers/service-orders.controller';
import { customerQuotations } from './modules/quotations/controllers/customer-quotations.controller';
import { visits } from './modules/visits/controllers/visits.controller';
import { publicCms } from './modules/cms/controllers/public-cms.controller';
import { publicLeads } from './modules/customers/controllers/public-leads.controller';
import { publicServices } from './modules/services/controllers/public-services.controller';
import { publicQuotations } from './modules/quotations/controllers/public-quotations.controller';
import { brand } from './modules/brand/controllers/brand.controller';
import { fonts } from './modules/brand/controllers/fonts.controller';
import { jwtMiddleware } from './modules/auth/middleware/jwt.middleware';
import { managerOr } from './modules/auth/middleware/manager.middleware';

const app = new Hono<AppBindings>();

app.use('*', logger());
// Reflected origin + credentials (a wildcard "*" is invalid on credentialed
// requests) so the browser stores/sends the lead-dedup cookie on the
// cross-origin POST /public/leads. Safe while auth stays header-based (Bearer
// JWT): the API sets no auth cookies, so credentialed CORS grants nothing
// ambient. Revisit before ever introducing cookie-based auth.
app.use('*', cors({ origin: (origin) => origin, credentials: true }));

app.get('/', (c) => c.json({ name: 'manttio-api', status: 'ok' }));

// Staff auth surface.
app.route('/auth', auth);

// Portal auth surface — separate from staff, with its own JWT secret and middleware.
// Mounted here, before the global JWT middleware, carrying its own guards route by route
// (02 §1).
app.route('/portal/auth', portalAuth);

// Public published-only CMS reads for the tenant website (no auth by design).
app.route('/public/cms', publicCms);

// Public lead intake from the tenant website's contact form — Turnstile-gated.
app.route('/public/leads', publicLeads);

// Public service catalog for the tenant website's services section (18 §4).
// Website-listed services only, prices included per-service opt-in.
app.route('/public/services', publicServices);

// Token-guarded quotation view + approve/decline for client contacts (20 §4).
// Mounted here, before the JWT middleware, for the same reason
// `/reports/download/{token}` is: the recipient has no account and the URL is
// the credential.
app.route('/public/quotations', publicQuotations);

// Tenant brand identity + font catalog. GET /brand and GET /fonts are public
// (login screens, website, field-app boot); PUT /brand carries its own guard
// (owner JWT or the whitelabel manager's shared token).
app.route('/brand', brand);
app.route('/fonts', fonts);

// JWT is required everywhere except `/auth/*`, `/`, `/public/*`, `/brand`,
// `/fonts`, and the public report-view path (also skipped inside jwtMiddleware
// itself for defense in depth). Uploads additionally admit the manager's
// shared token so a brand push can carry logo assets.
app.use('/users/*', jwtMiddleware);
app.use('/customers/*', jwtMiddleware);
app.use('/reports/*', jwtMiddleware);
app.use('/equipment/*', jwtMiddleware);
app.use('/contracts/*', jwtMiddleware);
app.use('/report-templates/*', jwtMiddleware);
app.use('/upload/*', managerOr(jwtMiddleware));
app.use('/cms/*', jwtMiddleware);
app.use('/notifications/*', jwtMiddleware);
app.use('/services/*', jwtMiddleware);
app.use('/quotations/*', jwtMiddleware);
app.use('/service-orders/*', jwtMiddleware);
app.use('/visits/*', jwtMiddleware);

app.route('/users', users);
app.route('/customers', customers);
// `GET /customers/:id/quotations` — owned by the quotations module (see its
// controller), mounted here so it sits under the customer it belongs to and
// inherits the `/customers/*` JWT middleware above.
app.route('/customers', customerQuotations);
app.route('/reports', reports);
app.route('/equipment', equipment);
app.route('/contracts', contracts);
app.route('/report-templates', reportTemplates);
app.route('/upload', upload);
app.route('/cms', cms);
app.route('/notifications', notifications);
app.route('/services', services);
app.route('/quotations', quotations);
app.route('/service-orders', serviceOrders);
app.route('/visits', visits);

app.onError((err, c) => {
  if (err instanceof SyntaxError || /JSON/i.test(err.message)) {
    return c.json({ error: 'invalid_json' }, 400);
  }
  console.error(err);
  return c.json({ error: 'internal_error', message: err.message }, 500);
});

app.notFound((c) => c.json({ error: 'not_found' }, 404));

// The Worker's first cron (notifications plan §2.4): the daily notifications
// retention sweep. When a second cron lands (WMS staging retention, 10-wms/11
// §4), it adds its entry to wrangler.toml `triggers.crons` and a dispatch
// branch on `controller.cron` here.
const scheduled = (controller: ScheduledController, env: Env, ctx: ExecutionContext): void => {
  ctx.waitUntil(sweepExpiredNotifications(createDb(env.DATABASE_URL), env));
};

// Named export for the test harness (`app.request`); the default export is
// the module-worker handler surface wrangler deploys.
export { app };
export default { fetch: app.fetch, scheduled };
