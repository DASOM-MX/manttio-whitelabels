import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { loginSchema } from '../validators/auth.validator';
import { login } from '../services/auth.service';

export const auth = new Hono<AppBindings>();

// Registration is closed: only admins can create users via POST /users (§4).
auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const token = await login(db, c.req.valid('json'), c.env.JWT_SECRET, c.env.ENVIRONMENT);
  if (!token) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  return c.json({ token });
});
