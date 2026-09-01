import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { env } from 'cloudflare:test';
import { createDb } from '../../src/modules/database/client';
import { portalUsers, portalUserGrants } from '../../src/modules/database/schema';
import {
  seedAdminAndLogin,
  seedOwnerAndLogin,
  seedCustomer,
  seedContact,
  seedTechnician,
} from '../helpers/fixtures';
import { request, json, jsonHeaders } from '../helpers/request';
import { mockResend, lastResendSend } from '../helpers/resend';

describe('Portal Users (Staff) — CP-4', () => {
  let adminToken: string;
  let adminUserId: string;
  let customerId: string;
  let contactId: string;
  let contactEmail: string;
  let contactName: string;

  mockResend();

  beforeAll(async () => {
    const { admin, token } = await seedAdminAndLogin();
    adminToken = token;
    adminUserId = admin.id;

    const customer = await seedCustomer();
    customerId = customer.id;

    const contact = await seedContact(customerId);
    contactId = contact.id;
    contactEmail = contact.email;
    contactName = contact.name;
  });

  describe('POST /portal-users (invite)', () => {
    it('should create a portal user with grants, no temp password in response', async () => {
      const res = await request('/portal-users', {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          contactId,
          grants: ['view_reports', 'view_quotations'],
          isAdmin: false,
        }),
      });

      expect(res.status).toBe(201);
      const body = await json<any>(res);
      
      // Assert created user has expected values
      expect(body.id).toBeTruthy();
      // The invite must copy THIS contact's identity, not merely produce
      // something email-shaped: seeding the wrong contact is the failure worth
      // catching, and `toBe(expect.stringContaining(...))` never matches at all
      // — `toBe` is Object.is and does not accept asymmetric matchers.
      expect(body.email).toBe(contactEmail);
      expect(body.name).toBe(contactName);
      expect(body.customerId).toBe(customerId);

      // The send itself is what broke last round: `from` was the tenant's public
      // contact address, which Resend refuses, and the failure was swallowed
      // into a console.error while this endpoint still answered 201. Nothing
      // inspected the email, so nothing caught it.
      const sent = lastResendSend();
      expect(sent).toBeTruthy();
      expect(sent!.to).toBe(contactEmail);
      // Must be the verified per-deploy sender, never brand.contact.email.
      expect(sent!.from).toContain('@');
      expect(sent!.html).toContain('/login');

      // Covers a leaked password *key*. The generated password never leaves the
      // service, so the test cannot compare against its value — this does not
      // prove no secret rode out under some other name.
      const responseText = JSON.stringify(body);
      expect(responseText).not.toContain('password');
      expect(responseText).not.toContain('tempPassword');
      expect(body.password).toBeUndefined();
      expect(body.tempPassword).toBeUndefined();

      // Verify the portal user was created in the database
      const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
      const [user] = await db
        .select()
        .from(portalUsers)
        .where(eq(portalUsers.id, body.id))
        .limit(1);
      expect(user).toBeTruthy();
      expect(user?.status).toBe('invited');
      expect(user?.isAdmin).toBe(false);
      expect(user?.mustChangePassword).toBe(true);

      // Verify grants were created
      const grants = await db
        .select()
        .from(portalUserGrants)
        .where(eq(portalUserGrants.portalUserId, body.id));
      expect(grants.length).toBe(2);
      expect(grants.map((g) => g.grant).sort()).toEqual(['view_quotations', 'view_reports']);
      // Verify grants are active (revoked_at is null)
      expect(grants.every((g) => !g.revokedAt)).toBe(true);
    });

    it('should reject with 404 if contact does not exist', async () => {
      const res = await request('/portal-users', {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          contactId: '00000000-0000-0000-0000-000000000000',
          grants: ['view_reports'],
          isAdmin: false,
        }),
      });

      expect(res.status).toBe(404);
      const body = await json<any>(res);
      expect(body.error).toBe('contact_not_found');
    });

    it('should reject with 409 if portal user already exists for contact', async () => {
      // Create a portal user for this contact first
      const contact = await seedContact(customerId);
      const res1 = await request('/portal-users', {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          contactId: contact.id,
          grants: ['view_reports'],
          isAdmin: false,
        }),
      });
      expect(res1.status).toBe(201);

      // Try to invite the same contact again
      const res2 = await request('/portal-users', {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          contactId: contact.id,
          grants: ['view_reports'],
          isAdmin: false,
        }),
      });

      expect(res2.status).toBe(409);
      const body = await json<any>(res2);
      expect(body.error).toBe('portal_user_exists');
    });

    it('should require owner or admin role', async () => {
      const tech = await seedTechnician();
      const loginRes = await request('/auth/login', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email: tech.email, password: tech.password }),
      });
      if (loginRes.status !== 200) throw new Error('Tech login failed');
      const { token: techToken } = await json<any>(loginRes);

      const res = await request('/portal-users', {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${techToken}` },
        body: JSON.stringify({
          contactId,
          grants: ['view_reports'],
          isAdmin: false,
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /portal-users/:id/grants (update grants)', () => {
    it('should update grants, revoking removed ones (not deleting)', async () => {
      const contact = await seedContact(customerId);
      const res1 = await request('/portal-users', {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          contactId: contact.id,
          grants: ['view_reports', 'view_quotations', 'view_contracts'],
          isAdmin: false,
        }),
      });
      const { id: userId } = await json<any>(res1);

      // Update grants to only include view_reports and view_quotations
      const res2 = await request(`/portal-users/${userId}/grants`, {
        method: 'PATCH',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          grants: ['view_reports', 'view_quotations'],
        }),
      });

      expect(res2.status).toBe(200);
      const body = await json<any>(res2);
      expect(body.grants.sort()).toEqual(['view_quotations', 'view_reports']);

      // Verify in database: view_contracts should be revoked (not deleted)
      const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
      const grants = await db
        .select()
        .from(portalUserGrants)
        .where(eq(portalUserGrants.portalUserId, userId));

      const activeGrants = grants.filter((g) => !g.revokedAt);
      expect(activeGrants.length).toBe(2);
      expect(activeGrants.map((g) => g.grant).sort()).toEqual(['view_quotations', 'view_reports']);

      // Verify revoked grant has revokedAt set (not deleted)
      const revokedGrants = grants.filter((g) => g.revokedAt);
      expect(revokedGrants.length).toBe(1);
      expect(revokedGrants[0]!.grant).toBe('view_contracts');
      expect(revokedGrants[0]!.revokedBy).toBe(adminUserId);
      expect(revokedGrants[0]!.revokedAt).not.toBeNull();
    });

    it('should reject with 404 if portal user not found', async () => {
      const res = await request('/portal-users/00000000-0000-0000-0000-000000000000/grants', {
        method: 'PATCH',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          grants: ['view_reports'],
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /portal-users/:id/suspend', () => {
    it('should change status to suspended', async () => {
      const contact = await seedContact(customerId);
      const res1 = await request('/portal-users', {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          contactId: contact.id,
          grants: ['view_reports'],
          isAdmin: false,
        }),
      });
      const { id: userId } = await json<any>(res1);

      const res2 = await request(`/portal-users/${userId}/suspend`, {
        method: 'PATCH',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const body = await json<any>(res2);
      expect(body.suspended).toBe(true);

      // Verify in database
      const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
      const [user] = await db
        .select()
        .from(portalUsers)
        .where(eq(portalUsers.id, userId))
        .limit(1);
      expect(user?.status).toBe('suspended');
    });

    it('should reject with 404 if portal user not found', async () => {
      const res = await request('/portal-users/00000000-0000-0000-0000-000000000000/suspend', {
        method: 'PATCH',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /portal-users/:id/resume', () => {
    it('should change status from suspended to active', async () => {
      const contact = await seedContact(customerId);
      const res1 = await request('/portal-users', {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          contactId: contact.id,
          grants: ['view_reports'],
          isAdmin: false,
        }),
      });
      const { id: userId } = await json<any>(res1);

      // Suspend first
      await request(`/portal-users/${userId}/suspend`, {
        method: 'PATCH',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
      });

      // Resume
      const res3 = await request(`/portal-users/${userId}/resume`, {
        method: 'PATCH',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
      });

      expect(res3.status).toBe(200);
      const body = await json<any>(res3);
      expect(body.resumed).toBe(true);

      // Verify in database
      const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
      const [user] = await db
        .select()
        .from(portalUsers)
        .where(eq(portalUsers.id, userId))
        .limit(1);
      expect(user?.status).toBe('active');
    });

    it('should reject with 404 if portal user not found', async () => {
      const res = await request('/portal-users/00000000-0000-0000-0000-000000000000/resume', {
        method: 'PATCH',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /portal-users/:id/password (staff reset)', () => {
    it('should set temp password and mustChangePassword flag, no password in response', async () => {
      const contact = await seedContact(customerId);
      const res1 = await request('/portal-users', {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          contactId: contact.id,
          grants: ['view_reports'],
          isAdmin: false,
        }),
      });
      const { id: userId } = await json<any>(res1);

      const res2 = await request(`/portal-users/${userId}/password`, {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const body = await json<any>(res2);
      
      // Verify no password in response
      expect(body.password).toBeUndefined();
      expect(body.tempPassword).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain('password');

      // Verify in database
      const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
      const [user] = await db
        .select()
        .from(portalUsers)
        .where(eq(portalUsers.id, userId))
        .limit(1);
      expect(user?.mustChangePassword).toBe(true);
    });

    it('should reject with 404 if portal user not found', async () => {
      const res = await request('/portal-users/00000000-0000-0000-0000-000000000000/password', {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /portal-users/:id (revoke access)', () => {
    it('should soft delete the portal user with comment', async () => {
      const contact = await seedContact(customerId);
      const res1 = await request('/portal-users', {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          contactId: contact.id,
          grants: ['view_reports'],
          isAdmin: false,
        }),
      });
      const { id: userId } = await json<any>(res1);

      const deleteComment = 'Employee left the company';
      const res2 = await request(`/portal-users/${userId}`, {
        method: 'DELETE',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ deleteComment }),
      });

      expect(res2.status).toBe(200);
      const body = await json<any>(res2);
      expect(body.revoked).toBe(true);

      // Verify in database: deletedAt, deletedBy, deleteComment should be set
      const db = createDb((env as { DATABASE_URL: string }).DATABASE_URL);
      const [user] = await db
        .select()
        .from(portalUsers)
        .where(eq(portalUsers.id, userId))
        .limit(1);
      expect(user?.deletedAt).not.toBeNull();
      expect(user?.deletedBy).toBe(adminUserId);
      expect(user?.deleteComment).toBe(deleteComment);
    });

    it('should reject with 404 if portal user not found', async () => {
      const res = await request('/portal-users/00000000-0000-0000-0000-000000000000', {
        method: 'DELETE',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ deleteComment: 'test' }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /portal-users/:id', () => {
    it('should return portal user with grants and admin flag', async () => {
      const contact = await seedContact(customerId);
      const res1 = await request('/portal-users', {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          contactId: contact.id,
          grants: ['view_reports', 'view_quotations'],
          isAdmin: true,
        }),
      });
      const { id: userId } = await json<any>(res1);

      const res2 = await request(`/portal-users/${userId}`, {
        method: 'GET',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
      });

      expect(res2.status).toBe(200);
      const body = await json<any>(res2);
      expect(body.user).toBeTruthy();
      expect(body.user.id).toBe(userId);
      expect(body.user.isAdmin).toBe(true);
      expect(body.user.grants.sort()).toEqual(['view_quotations', 'view_reports']);
      expect(body.user.status).toBe('invited');
    });

    it('should reject with 404 if portal user not found', async () => {
      const res = await request('/portal-users/00000000-0000-0000-0000-000000000000', {
        method: 'GET',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /portal-users (tenant-wide list)', () => {
    it('is owner-only: an admin gets 403 where an owner gets 200', async () => {
      // Deliberately narrower than the rest of this controller. If the gate is
      // widened to ADMIN_TIER this test goes red, which is the point — the
      // asymmetry is a decision, not an oversight.
      const admin = await request('/portal-users?page=1&limit=20', {
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
      });
      expect(admin.status).toBe(403);

      const { token: ownerToken } = await seedOwnerAndLogin();
      const owner = await request('/portal-users?page=1&limit=20', {
        headers: { ...jsonHeaders(), authorization: `Bearer ${ownerToken}` },
      });
      expect(owner.status).toBe(200);
    });

    it('returns the invited user with its customer, grants and inviter joined', async () => {
      const { token: ownerToken } = await seedOwnerAndLogin();
      const contact = await seedContact(customerId);

      const invited = await request('/portal-users', {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          contactId: contact.id,
          grants: ['view_reports', 'view_quotations'],
          isAdmin: true,
        }),
      });
      expect(invited.status).toBe(201);

      const res = await request(
        `/portal-users?page=1&limit=50&customerId=${customerId}`,
        { headers: { ...jsonHeaders(), authorization: `Bearer ${ownerToken}` } },
      );
      expect(res.status).toBe(200);
      const body = await json<{ items: any[]; total: number; page: number; limit: number }>(res);

      const row = body.items.find((i) => i.email === contact.email);
      expect(row).toBeTruthy();
      // The joins are the reason this endpoint exists rather than a raw select.
      expect(row.customerName).toBeTruthy();
      expect(row.invitedByName).toBeTruthy();
      expect(row.grants.sort()).toEqual(['view_quotations', 'view_reports']);
      expect(row.isAdmin).toBe(true);
      expect(row.status).toBe('invited');
      // An invite nobody has used yet — 26 §1 calls this the row that matters.
      expect(row.lastLoginAt).toBeNull();

      // Never on a list page, whatever the row type says.
      expect(row.passwordHash).toBeUndefined();
      expect(row.mustChangePassword).toBeUndefined();
      expect(row.failedLoginAttempts).toBeUndefined();
      expect(row.deletedAt).toBeUndefined();
    });

    it('counts every match, not just the page it returned', async () => {
      const { token: ownerToken } = await seedOwnerAndLogin();
      const customer = await seedCustomer();
      for (let i = 0; i < 3; i++) {
        const c = await seedContact(customer.id);
        await request('/portal-users', {
          method: 'POST',
          headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ contactId: c.id, grants: ['view_reports'], isAdmin: false }),
        });
      }

      const res = await request(
        `/portal-users?page=1&limit=2&customerId=${customer.id}`,
        { headers: { ...jsonHeaders(), authorization: `Bearer ${ownerToken}` } },
      );
      const body = await json<{ items: any[]; total: number }>(res);

      // total is the filter's count; items is one page of it. Returning
      // items.length here is the exact defect GenericQueryResponse exists to
      // stop, and it would be invisible with a limit above the row count.
      expect(body.items.length).toBe(2);
      expect(body.total).toBe(3);
    });

    it('filters by grant, excluding users who lack it', async () => {
      const { token: ownerToken } = await seedOwnerAndLogin();
      const customer = await seedCustomer();
      const withGrant = await seedContact(customer.id);
      const without = await seedContact(customer.id);

      for (const [contact, grants] of [
        [withGrant, ['view_contracts']],
        [without, ['view_reports']],
      ] as const) {
        await request('/portal-users', {
          method: 'POST',
          headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ contactId: contact.id, grants, isAdmin: false }),
        });
      }

      const res = await request(
        `/portal-users?page=1&limit=50&customerId=${customer.id}&grant=view_contracts`,
        { headers: { ...jsonHeaders(), authorization: `Bearer ${ownerToken}` } },
      );
      const body = await json<{ items: any[]; total: number }>(res);

      expect(body.items.map((i) => i.email)).toEqual([withGrant.email]);
      expect(body.total).toBe(1);
    });

    it('rejects approve_quotations without view_quotations', async () => {
      const contact = await seedContact(customerId);
      const res = await request('/portal-users', {
        method: 'POST',
        headers: { ...jsonHeaders(), authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          contactId: contact.id,
          grants: ['approve_quotations'],
          isAdmin: false,
        }),
      });
      // 01 §3: approving a document you cannot open is not a state we represent.
      expect(res.status).toBe(400);
    });
  });
});
