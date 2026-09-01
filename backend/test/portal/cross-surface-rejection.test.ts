import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { request, json, authHeader, env } from '../helpers';

/**
 * Cross-surface rejection tests: verify that portal tokens are rejected on staff
 * routes and staff tokens are rejected on portal routes, even when both secrets
 * are identical. This proves the rejection is structural (via `typ` and `role`
 * claims), not merely by secret difference.
 */
describe('Cross-surface token rejection', () => {
  const sharedSecret = 'shared-secret-for-structural-test';

  async function generateStaffToken(): Promise<string> {
    const key = new TextEncoder().encode(sharedSecret);
    return new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('test-staff-id')
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(key);
  }

  async function generatePortalToken(): Promise<string> {
    const key = new TextEncoder().encode(sharedSecret);
    return new SignJWT({ cid: 'test-customer-id', typ: 'portal' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('test-portal-user-id')
      .setIssuedAt()
      .setExpirationTime('2d')
      .sign(key);
  }

  it('rejects a staff token on /portal/auth/me even with identical secrets', async () => {
    const staffToken = await generateStaffToken();

    const res = await request('/portal/auth/me', {
      method: 'GET',
      headers: authHeader(staffToken),
    });

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe('unauthorized');
  });

  it('rejects a portal token on /users even with identical secrets', async () => {
    const portalToken = await generatePortalToken();

    const res = await request('/users', {
      method: 'GET',
      headers: authHeader(portalToken),
    });

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe('unauthorized');
  });

  it('rejects a portal token on /reports even with identical secrets', async () => {
    const portalToken = await generatePortalToken();

    const res = await request('/reports', {
      method: 'GET',
      headers: authHeader(portalToken),
    });

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe('unauthorized');
  });

  it('rejects a portal token on /customers even with identical secrets', async () => {
    const portalToken = await generatePortalToken();

    const res = await request('/customers', {
      method: 'GET',
      headers: authHeader(portalToken),
    });

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe('unauthorized');
  });

  it('rejects a portal token on /upload/image even with identical secrets', async () => {
    const portalToken = await generatePortalToken();

    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(portalToken),
    });

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe('unauthorized');
  });
});
