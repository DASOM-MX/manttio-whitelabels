import { describe, it, expect } from 'vitest';
import { app } from '../../src/index';
import { SignJWT } from 'jose';

// Generate a test staff JWT token
async function generateStaffToken(secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('test-staff-id')
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

// Generate a test portal JWT token
async function generatePortalToken(secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ cid: 'test-customer-id', typ: 'portal' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('test-portal-user-id')
    .setIssuedAt()
    .setExpirationTime('2d')
    .sign(key);
}

describe('Cross-surface token rejection', () => {
  it('should reject a staff token on /portal/auth/me', async () => {
    // Arrange: use a test JWT_SECRET from env
    const staffSecret = process.env.JWT_SECRET || 'test-staff-secret-key-for-testing-only';
    const staffToken = await generateStaffToken(staffSecret);

    // Act: attempt to use the staff token on a portal route
    const res = await app.request('/portal/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${staffToken}`,
      },
    });

    // Assert: should be 401 because the token was signed with the wrong secret
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  it('should reject a portal token on /users', async () => {
    // Arrange: use a test PORTAL_JWT_SECRET from env
    const portalSecret = process.env.PORTAL_JWT_SECRET || 'test-portal-secret-key-for-testing-only';
    const portalToken = await generatePortalToken(portalSecret);

    // Act: attempt to use the portal token on a staff route
    const res = await app.request('/users', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${portalToken}`,
      },
    });

    // Assert: should be 401 because the token was signed with the wrong secret
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  it('should reject a portal token on /reports', async () => {
    // Arrange
    const portalSecret = process.env.PORTAL_JWT_SECRET || 'test-portal-secret-key-for-testing-only';
    const portalToken = await generatePortalToken(portalSecret);

    // Act
    const res = await app.request('/reports', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${portalToken}`,
      },
    });

    // Assert
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  it('should reject a portal token on /customers', async () => {
    // Arrange
    const portalSecret = process.env.PORTAL_JWT_SECRET || 'test-portal-secret-key-for-testing-only';
    const portalToken = await generatePortalToken(portalSecret);

    // Act
    const res = await app.request('/customers', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${portalToken}`,
      },
    });

    // Assert
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unauthorized');
  });

  it('should reject a portal token on /upload/image', async () => {
    // Arrange
    const portalSecret = process.env.PORTAL_JWT_SECRET || 'test-portal-secret-key-for-testing-only';
    const portalToken = await generatePortalToken(portalSecret);

    // Act
    const res = await app.request('/upload/image', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${portalToken}`,
      },
    });

    // Assert
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('unauthorized');
  });
});
