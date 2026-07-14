import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { AppBindings } from './env';
import { auth } from './modules/auth/controllers/auth.controller';
import { users } from './modules/users/controllers/users.controller';
import { customers } from './modules/customers/controllers/customers.controller';
import { reports } from './modules/reports/controllers/reports.controller';
import { reportTemplates } from './modules/report-templates/controllers/report-templates.controller';
import { upload } from './modules/upload/controllers/upload.controller';
import { cms } from './modules/cms/controllers/cms.controller';
import { publicCms } from './modules/cms/controllers/public-cms.controller';
import { brand } from './modules/brand/controllers/brand.controller';
import { fonts } from './modules/brand/controllers/fonts.controller';
import { jwtMiddleware } from './modules/auth/middleware/jwt.middleware';
import { managerOr } from './modules/auth/middleware/manager.middleware';

const app = new Hono<AppBindings>();

app.use('*', logger());
app.use('*', cors());

app.get('/', (c) => c.json({ name: 'manttio-api', status: 'ok' }));

app.route('/auth', auth);

// Public published-only CMS reads for the tenant website (no auth by design).
app.route('/public/cms', publicCms);

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
app.use('/report-templates/*', jwtMiddleware);
app.use('/upload/*', managerOr(jwtMiddleware));
app.use('/cms/*', jwtMiddleware);

app.route('/users', users);
app.route('/customers', customers);
app.route('/reports', reports);
app.route('/report-templates', reportTemplates);
app.route('/upload', upload);
app.route('/cms', cms);

app.onError((err, c) => {
  if (err instanceof SyntaxError || /JSON/i.test(err.message)) {
    return c.json({ error: 'invalid_json' }, 400);
  }
  console.error(err);
  return c.json({ error: 'internal_error', message: err.message }, 500);
});

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
