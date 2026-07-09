import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { changePasswordSchema, loginSchema } from '../validators/auth.validator';
import { changeOwnPassword, login } from '../services/auth.service';
import { jwtMiddleware } from '../middleware/jwt.middleware';

export const auth = new Hono<AppBindings>();

// Registration is closed: only admins can create users via POST /users (§4).
auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const result = await login(db, c.req.valid('json'), c.env.JWT_SECRET, c.env.ENVIRONMENT);
  if (!result) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  return c.json(result);
});

// Change-own password — clears `mustChangePassword` (backend plan §1). The
// /auth prefix is mounted before the global JWT middleware (login must stay
// public), so this route carries the guard itself.
auth.post('/password', jwtMiddleware, zValidator('json', changePasswordSchema), async (c) => {
  const me = c.get('user');
  const db = createDb(c.env.DATABASE_URL);
  const changed = await changeOwnPassword(db, me.id, c.req.valid('json').password);
  if (!changed) return c.json({ error: 'not_found' }, 404);
  return c.json({ changed: true });
});
