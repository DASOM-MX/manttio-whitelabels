import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { request, json, authHeader, env } from '../helpers';
import { seedPortalUser } from '../helpers/fixtures';

/**
 * Cross-surface rejection tests: verify that portal tokens are rejected on staff
 * routes and staff tokens are rejected on portal routes, by claim discrimination,
 * not by secret difference.
 *
 * Strategy: each token is signed with the key the *receiving* surface uses, so
 * signature verification succeeds. Rejection must come from the claim check alone.
 * - Staff token signed with env.PORTAL_JWT_SECRET, carrying a REAL seeded portal
 *   user's id as `sub` and their real customerId as `cid`, but typ: 'staff'.
 *   The signature verifies and both the sub and cid guards pass, so `typ` is the
 *   only claim left that can reject it. The real `cid` is load-bearing: an absent
 *   one short-circuits the guard earlier and the typ check never runs, which is
 *   how this test twice passed while proving nothing. Do not 'tidy' it away.
 * - Portal token (typ: 'portal', no role) signed with env.JWT_SECRET:
 *   staff middleware verifies the signature, then rejects on missing role claim
 */
describe('Cross-surface token rejection', () => {
  const testEnv = env as unknown as Record<string, string>;

  it('has the secrets the harness is supposed to inject', () => {
    expect(testEnv.JWT_SECRET).toBeTruthy();
    expect(testEnv.PORTAL_JWT_SECRET).toBeTruthy();
  });

  async function generateStaffTokenSignedWithPortalSecret(portalUserId: string, customerId: string): Promise<string> {
    // Sign a staff-shaped payload with env.PORTAL_JWT_SECRET so the portal
    // middleware can verify the signature. Use the portal user's real ID + customer ID
    // but with typ: 'staff' (not 'portal'). The portal middleware must reject on typ check
    // because it requires typ === 'portal' as the discriminating claim.
    const key = new TextEncoder().encode(testEnv.PORTAL_JWT_SECRET);
    return new SignJWT({ role: 'admin', typ: 'staff', cid: customerId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(portalUserId)
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(key);
  }

  async function generatePortalTokenSignedWithStaffSecret(): Promise<string> {
    // Sign a portal-shaped payload with env.JWT_SECRET so the staff
    // middleware can verify the signature, then must reject on missing role claim.
    // The staff middleware checks for a valid role claim, which portal tokens lack.
    const key = new TextEncoder().encode(testEnv.JWT_SECRET);
    return new SignJWT({ cid: 'test-customer-id', typ: 'portal' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('test-portal-user-id')
      .setIssuedAt()
      .setExpirationTime('2d')
      .sign(key);
  }

  it('rejects a staff-shaped token on /portal/auth/me when typ !== "portal" (signed with env.PORTAL_JWT_SECRET)', async () => {
    // Seed a real portal user so the ID is valid and can be verified
    const portalUser = await seedPortalUser();
    // Generate a token with the real user ID and customer ID, but typ: 'staff'
    const staffToken = await generateStaffTokenSignedWithPortalSecret(portalUser.id, portalUser.customerId);

    const res = await request('/portal/auth/me', {
      method: 'GET',
      headers: authHeader(staffToken),
    });

    // Signature verifies successfully, but typ !== 'portal' causes rejection at the claim check
    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe('unauthorized');
  });


  it('rejects a portal token on /portal-users (the staff portal-admin surface)', async () => {
    // /portal-users is a staff route despite the name — it is how staff invite and
    // manage portal users (02 CP-4). A portal user reaching it could grant itself
    // access, so the prefix belongs in this list alongside the others.
    const portalToken = await generatePortalTokenSignedWithStaffSecret();

    const res = await request('/portal-users', {
      method: 'GET',
      headers: authHeader(portalToken),
    });

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe('unauthorized');
  });

  it('rejects a portal token on /users (signed with env.JWT_SECRET)', async () => {
    const portalToken = await generatePortalTokenSignedWithStaffSecret();

    const res = await request('/users', {
      method: 'GET',
      headers: authHeader(portalToken),
    });

    // Signature verifies, but missing role claim causes rejection
    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe('unauthorized');
  });

  it('rejects a portal token on /reports (signed with env.JWT_SECRET)', async () => {
    const portalToken = await generatePortalTokenSignedWithStaffSecret();

    const res = await request('/reports', {
      method: 'GET',
      headers: authHeader(portalToken),
    });

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe('unauthorized');
  });

  it('rejects a portal token on /customers (signed with env.JWT_SECRET)', async () => {
    const portalToken = await generatePortalTokenSignedWithStaffSecret();

    const res = await request('/customers', {
      method: 'GET',
      headers: authHeader(portalToken),
    });

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe('unauthorized');
  });

  it('rejects a portal token on /upload/image (signed with env.JWT_SECRET)', async () => {
    const portalToken = await generatePortalTokenSignedWithStaffSecret();

    const res = await request('/upload/image', {
      method: 'POST',
      headers: authHeader(portalToken),
    });

    expect(res.status).toBe(401);
    const body = await json<{ error: string }>(res);
    expect(body.error).toBe('unauthorized');
  });
});
