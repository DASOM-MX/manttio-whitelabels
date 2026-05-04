import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../env';
import { createDb } from '../db/client';
import { findUserByEmail, toPublicUser } from '../db/repositories/users';
import { verifyPassword } from '../lib/password';
import { signAuthToken } from '../lib/jwt';
import { loginSchema } from '../validators/auth';

export const auth = new Hono<AppBindings>();

// Registration is closed: only admins can create users via POST /users (§4).
auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  const db = createDb(c.env.DATABASE_URL);

  const user = await findUserByEmail(db, email);
  if (!user) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }

  const token = await signAuthToken(c.env.JWT_SECRET, c.env.ENVIRONMENT, {
    id: user.id,
    role: user.role,
  });

  return c.json({ token, user: toPublicUser(user) });
});
