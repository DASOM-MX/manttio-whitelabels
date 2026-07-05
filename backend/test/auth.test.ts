import { describe, expect, test } from 'vitest';
import { SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { authHeader, env, json, jsonHeaders, request } from './helpers/request';
import { loginAs, seedAdmin, seedTechnician } from './helpers/fixtures';
import { createDb } from '../src/modules/database/client';
import { users } from '../src/modules/database/schema';

type WorkerEnv = { JWT_SECRET: string; DATABASE_URL: string };

const decodePayload = (jwt: string): Record<string, unknown> => {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error(`malformed JWT: ${jwt}`);
  const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(atob(padded)) as Record<string, unknown>;
};

const signWithSecret = async (
  secret: string,
  payload: { sub?: unknown; role?: unknown; expSecondsFromNow?: number },
): Promise<string> => {
  const key = new TextEncoder().encode(secret);
  const jwt = new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt();
  if (payload.sub !== undefined) jwt.setSubject(payload.sub as string);
  const expSeconds = payload.expSecondsFromNow ?? 3600;
  jwt.setExpirationTime(Math.floor(Date.now() / 1000) + expSeconds);
  return jwt.sign(key);
};

describe('auth – login', () => {
  test('returns a JWT with sub + role claims for valid credentials', async () => {
    const admin = await seedAdmin();

    const res = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: admin.email, password: admin.password }),
    });

    expect(res.status).toBe(200);
    const body = await json<{ token: string }>(res);
    expect(body.token.split('.')).toHaveLength(3);

    const claims = decodePayload(body.token);
    expect(claims.sub).toBe(admin.id);
    expect(claims.role).toBe('admin');
    expect(typeof claims.exp).toBe('number');
    expect(typeof claims.iat).toBe('number');
    expect((claims.exp as number) > (claims.iat as number)).toBe(true);
  });

  test('issues role=technician for technicians', async () => {
    const tech = await seedTechnician();
    const token = await loginAs(tech);
    expect(decodePayload(token).role).toBe('technician');
  });

  test('wrong password → 401 invalid_credentials', async () => {
    const admin = await seedAdmin();
    const res = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: admin.email, password: 'definitely-not-it' }),
    });
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: 'invalid_credentials' });
  });

  test('unknown email → 401 invalid_credentials (same shape; do not leak existence)', async () => {
    const res = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        email: `test+nonexistent-${Math.random().toString(36).slice(2)}@penanevadachillers.com`,
        password: 'whatever',
      }),
    });
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: 'invalid_credentials' });
  });

  test('soft-deleted user cannot log in', async () => {
    const admin = await seedAdmin();
    const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, admin.id));

    const res = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: admin.email, password: admin.password }),
    });
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: 'invalid_credentials' });
  });

  test('missing email → 400', async () => {
    const res = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ password: 'pw' }),
    });
    expect(res.status).toBe(400);
  });

  test('invalid email format → 400', async () => {
    const res = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: 'not-an-email', password: 'pw' }),
    });
    expect(res.status).toBe(400);
  });

  test('empty password → 400', async () => {
    const res = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email: 'someone@example.com', password: '' }),
    });
    expect(res.status).toBe(400);
  });

  test('malformed JSON body → 400 invalid_json', async () => {
    const res = await request('/auth/login', {
      method: 'POST',
      headers: jsonHeaders(),
      body: '{not json',
    });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: 'invalid_json' });
  });
});

describe('auth – jwt middleware on protected routes', () => {
  test('missing Authorization header → 401 unauthorized', async () => {
    const res = await request('/users/me');
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ error: 'unauthorized' });
  });

  test('non-Bearer Authorization header → 401', async () => {
    const res = await request('/users/me', {
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(res.status).toBe(401);
  });

  test('garbage Bearer token → 401', async () => {
    const res = await request('/users/me', { headers: authHeader('not.a.real.jwt') });
    expect(res.status).toBe(401);
  });

  test('JWT signed with wrong secret → 401', async () => {
    const admin = await seedAdmin();
    const forged = await signWithSecret('this-is-not-the-real-secret', {
      sub: admin.id,
      role: 'admin',
    });
    const res = await request('/users/me', { headers: authHeader(forged) });
    expect(res.status).toBe(401);
  });

  test('expired JWT → 401', async () => {
    const admin = await seedAdmin();
    const realSecret = (env as unknown as WorkerEnv).JWT_SECRET;
    const expired = await signWithSecret(realSecret, {
      sub: admin.id,
      role: 'admin',
      expSecondsFromNow: -60,
    });
    const res = await request('/users/me', { headers: authHeader(expired) });
    expect(res.status).toBe(401);
  });

  test('JWT with role outside the allowed enum → 401', async () => {
    const admin = await seedAdmin();
    const realSecret = (env as unknown as WorkerEnv).JWT_SECRET;
    const bogus = await signWithSecret(realSecret, { sub: admin.id, role: 'superadmin' });
    const res = await request('/users/me', { headers: authHeader(bogus) });
    expect(res.status).toBe(401);
  });

  test('JWT without sub claim → 401', async () => {
    const realSecret = (env as unknown as WorkerEnv).JWT_SECRET;
    const noSub = await signWithSecret(realSecret, { role: 'admin' });
    const res = await request('/users/me', { headers: authHeader(noSub) });
    expect(res.status).toBe(401);
  });

  test('valid JWT lets the request through and exposes the user on context', async () => {
    const admin = await seedAdmin();
    const token = await loginAs(admin);
    const res = await request('/users/me', { headers: authHeader(token) });
    expect(res.status).toBe(200);
    const body = await json<{ user: { id: string; email: string; role: string } }>(res);
    expect(body.user.id).toBe(admin.id);
    expect(body.user.email).toBe(admin.email);
    expect(body.user.role).toBe('admin');
  });

  test('public download path bypasses jwt middleware (does not return 401)', async () => {
    const res = await request('/reports/download/nonexistent-token');
    expect(res.status).not.toBe(401);
  });
});
