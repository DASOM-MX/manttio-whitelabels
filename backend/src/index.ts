import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { AppBindings } from './env';
import { auth } from './routes/auth';
import { users } from './routes/users';
import { customers } from './routes/customers';
import { reports } from './routes/reports';
import { upload } from './routes/upload';
import { jwtMiddleware } from './middleware/jwt';

const app = new Hono<AppBindings>();

app.use('*', logger());
app.use('*', cors());

app.get('/', (c) => c.json({ name: 'manttio-api', status: 'ok' }));

app.route('/auth', auth);

// JWT is required everywhere except `/auth/*`, `/`, and the public report-view path
// (the public path is also skipped inside jwtMiddleware itself for defense in depth).
app.use('/users/*', jwtMiddleware);
app.use('/customers/*', jwtMiddleware);
app.use('/reports/*', jwtMiddleware);
app.use('/upload/*', jwtMiddleware);

app.route('/users', users);
app.route('/customers', customers);
app.route('/reports', reports);
app.route('/upload', upload);

app.onError((err, c) => {
  if (err instanceof SyntaxError || /JSON/i.test(err.message)) {
    return c.json({ error: 'invalid_json' }, 400);
  }
  console.error(err);
  return c.json({ error: 'internal_error', message: err.message }, 500);
});

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
