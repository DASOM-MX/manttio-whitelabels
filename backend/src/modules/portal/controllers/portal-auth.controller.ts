import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import {
  portalLoginSchema,
  portalChangePasswordSchema,
} from '../validators/portal-auth.validator';
import { portalLogin, portalGetMe, portalChangeOwnPassword } from '../services/portal-auth.service';
import { portalJwtMiddleware } from '../middleware/portal-jwt.middleware';

export const portalAuth = new Hono<AppBindings>();

/**
 * POST /portal/auth/login — portal credentials with A3 lockout.
 * Invalid credentials (email unknown, password wrong, locked account, or
 * suspended/deleted) all answer 401 invalid_credentials.
 */
portalAuth.post('/login', zValidator('json', portalLoginSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const result = await portalLogin(db, c.req.valid('json'), c.env.PORTAL_JWT_SECRET);
  if (!result) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  return c.json(result);
});

/**
 * GET /portal/auth/me — session snapshot: user + role + customer + grants + mustChangePassword.
 * The boot payload the app gates its nav on.
 */
portalAuth.get('/me', portalJwtMiddleware, async (c) => {
  const user = c.get('portalUser');
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const db = createDb(c.env.DATABASE_URL);
  const result = await portalGetMe(db, user.id, user.grants, user.customerId);
  if (!result) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.json(result);
});

/**
 * POST /portal/auth/password — change own password; clears must_change_password,
 * flips status from invited → active. The caller is already JWT-authenticated
 * (they just logged in with the temp password).
 */
portalAuth.post('/password', portalJwtMiddleware, zValidator('json', portalChangePasswordSchema), async (c) => {
  const user = c.get('portalUser');
  if (!user) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const db = createDb(c.env.DATABASE_URL);
  const changed = await portalChangeOwnPassword(db, user.id, c.req.valid('json').password);
  if (!changed) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.json({ changed: true });
});
