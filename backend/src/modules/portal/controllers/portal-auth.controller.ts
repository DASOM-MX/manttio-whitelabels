import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import {
  portalLoginSchema,
  portalChangePasswordSchema,
  portalForgotPasswordSchema,
  portalResetPasswordSchema,
} from '../validators/portal-auth.validator';
import {
  portalLogin,
  portalGetMe,
  portalChangeOwnPassword,
  portalForgotPassword,
  portalResetPassword,
} from '../services/portal-auth.service';
import { portalJwtMiddleware } from '../middleware/portal-jwt.middleware';
import { verifyTurnstileToken } from '../../turnstile/services/turnstile.service';

export const portalAuth = new Hono<AppBindings>();

/**
 * POST /portal/auth/login — portal credentials with A3 lockout.
 * Invalid credentials (email unknown, password wrong, locked account, or
 * suspended/deleted) all answer 401 invalid_credentials.
 */
portalAuth.post('/login', zValidator('json', portalLoginSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const input = c.req.valid('json');

  // Turnstile verification (required).
  const remoteIp = c.req.header('cf-connecting-ip');
  const verdict = await verifyTurnstileToken(c.env, input.turnstileToken, remoteIp);
  if (!verdict.success) {
    return c.json({ error: 'turnstile_failed' }, 403);
  }

  const result = await portalLogin(db, input, c.env.PORTAL_JWT_SECRET);
  if (!result) {
    return c.json({ error: 'invalid_credentials' }, 401);
  }
  return c.json(result);
});

/**
 * GET /portal/auth/me — session snapshot: user + customer + grants + mustChangePassword + isAdmin.
 * The boot payload the app gates its nav on. Guaranteed to run after portalJwtMiddleware
 * sets portalUser.
 */
portalAuth.get('/me', portalJwtMiddleware, async (c) => {
  const user = c.get('portalUser');

  const db = createDb(c.env.DATABASE_URL);
  const result = await portalGetMe(db, user.id, user.grants, user.customerId);
  if (!result) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.json(result);
});

/**
 * POST /portal/auth/password — change own password; clears must_change_password,
 * flips status from invited → active. Guaranteed to run after portalJwtMiddleware.
 */
portalAuth.post('/password', portalJwtMiddleware, zValidator('json', portalChangePasswordSchema), async (c) => {
  const user = c.get('portalUser');

  const db = createDb(c.env.DATABASE_URL);
  const changed = await portalChangeOwnPassword(db, user.id, c.req.valid('json').password);
  if (!changed) {
    return c.json({ error: 'not_found' }, 404);
  }
  return c.json({ changed: true });
});

/**
 * POST /portal/auth/forgot-password — initiate a password reset.
 * Always returns 204, unknown addresses included (no account enumeration).
 * On a match: creates a reset token, sends it via email (1h TTL).
 */
portalAuth.post('/forgot-password', zValidator('json', portalForgotPasswordSchema), async (c) => {
  const input = c.req.valid('json');

  // Turnstile verification (required).
  const remoteIp = c.req.header('cf-connecting-ip');
  const verdict = await verifyTurnstileToken(c.env, input.turnstileToken, remoteIp);
  if (!verdict.success) {
    return c.json({ error: 'turnstile_failed' }, 403);
  }

  const db = createDb(c.env.DATABASE_URL);
  // Hand the mail send to waitUntil so the response time does not depend on
  // whether the address exists. `executionCtx` is absent outside the Workers
  // runtime (the test harness), where awaiting is both fine and desirable.
  let defer: ((work: Promise<unknown>) => void) | undefined;
  try {
    const ctx = c.executionCtx;
    defer = (work) => ctx.waitUntil(work);
  } catch {
    defer = undefined;
  }
  await portalForgotPassword(db, c.env, input, defer);

  // Always 204, even for unknown addresses.
  return c.body(null, 204);
});

/**
 * POST /portal/auth/reset-password — complete a password reset.
 * Validates token (must be unused, non-expired), then sets the new password.
 * Returns 400 if token is invalid/expired/used.
 */
portalAuth.post('/reset-password', zValidator('json', portalResetPasswordSchema), async (c) => {
  const { token, password } = c.req.valid('json');

  const db = createDb(c.env.DATABASE_URL);
  const ok = await portalResetPassword(db, token, password);

  if (!ok) {
    return c.json({ error: 'invalid_or_expired_token' }, 400);
  }

  return c.json({ changed: true });
});
