import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { AppBindings } from './env';
import { auth } from './modules/auth/controllers/auth.controller';
import { users } from './modules/users/controllers/users.controller';
import { customers } from './modules/customers/controllers/customers.controller';
import { reports } from './modules/reports/controllers/reports.controller';
import { upload } from './modules/upload/controllers/upload.controller';
import { cms } from './modules/cms/controllers/cms.controller';
import { publicCms } from './modules/cms/controllers/public-cms.controller';
import { jwtMiddleware } from './modules/auth/middleware/jwt.middleware';

const app = new Hono<AppBindings>();

app.use('*', logger());
app.use('*', cors());

app.get('/', (c) => c.json({ name: 'manttio-api', status: 'ok' }));

app.route('/auth', auth);

// Public published-only CMS reads for the tenant website (no auth by design).
app.route('/public/cms', publicCms);

// JWT is required everywhere except `/auth/*`, `/`, `/public/*`, and the public
// report-view path (also skipped inside jwtMiddleware itself for defense in depth).
app.use('/users/*', jwtMiddleware);
app.use('/customers/*', jwtMiddleware);
app.use('/reports/*', jwtMiddleware);
app.use('/upload/*', jwtMiddleware);
app.use('/cms/*', jwtMiddleware);

app.route('/users', users);
app.route('/customers', customers);
app.route('/reports', reports);
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
