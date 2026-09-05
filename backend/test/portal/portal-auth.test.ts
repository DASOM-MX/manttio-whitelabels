import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { request, json, jsonHeaders, env } from '../helpers';
import { seedPortalUser } from '../helpers/fixtures';
import { mockTurnstile, setTurnstileVerdict } from '../helpers/turnstile';
import { mockResend, lastResendSend } from '../helpers/resend';
import { createDb } from '../../src/modules/database/client';
import { portalUsers, portalPasswordResets } from '../../src/modules/database/schema';
import { hashResetToken } from '../../src/modules/portal/utils/reset-token';
import { PortalUserStatus } from '../../src/modules/portal/enums/portal-users.enum';

type WorkerEnv = { DATABASE_URL: string };

/**
 * Portal auth tests — login, me, password change, and A3 lockout (5 fails → 2h cooldown).
 */
describe('portal auth', () => {
  // Mock Turnstile HTTP calls for the entire test suite.
  mockTurnstile();
  mockResend();
  /**
   * A3 lockout: 5 failed attempts lock an account for 2 hours; the lock self-clears
   * after the window expires, and a correct password during lockout is still rejected.
   */
  describe('lockout behavior', () => {
    async function findPortalUser(id: string) {
      const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
      const result = await db
        .select()
        .from(portalUsers)
        .where(eq(portalUsers.id, id))
        .limit(1);
      return result[0];
    }

    async function attemptLogin(email: string, password: string) {
      const res = await request('/portal/auth/login', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email, password, turnstileToken: 'tok-test' }),
      });
      return res;
    }

    it('locks account after 5 failed attempts and refuses even correct password', async () => {
      const user = await seedPortalUser();

      // Attempts 1-4: wrong password, should succeed with 401
      for (let i = 0; i < 4; i++) {
        const res = await attemptLogin(user.email, 'wrong-password');
        expect(res.status).toBe(401);
        const body = await json<{ error: string }>(res);
        expect(body.error).toBe('invalid_credentials');
      }

      // Attempt 5: wrong password triggers lockout
      const res5 = await attemptLogin(user.email, 'wrong-password');
      expect(res5.status).toBe(401);

      // Attempt 6: correct password still rejected while locked
      const res6 = await attemptLogin(user.email, user.password);
      expect(res6.status).toBe(401);
      const body6 = await json<{ error: string }>(res6);
      expect(body6.error).toBe('invalid_credentials');

      // Verify lockout state: failed_login_attempts = 5, locked_until is ~2h ahead
      const locked = await findPortalUser(user.id);
      expect(locked?.failedLoginAttempts).toBe(5);
      expect(locked?.lockedUntil).toBeTruthy();
      const now = Date.now();
      const lockWindow = 2 * 60 * 60 * 1000;
      const lockTime = locked?.lockedUntil ? locked.lockedUntil.getTime() : 0;
      expect(lockTime).toBeGreaterThan(now);
      expect(lockTime).toBeLessThan(now + lockWindow + 60000); // within 2h + 1min
    });

    it('self-clearing: lock expires after 2 hours and resets counter', async () => {
      const user = await seedPortalUser();
      const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);

      // Drive into locked state: 5 wrong attempts
      for (let i = 0; i < 5; i++) {
        await attemptLogin(user.email, 'wrong-password');
      }

      // Verify locked
      let row = await findPortalUser(user.id);
      expect(row?.failedLoginAttempts).toBe(5);
      expect(row?.lockedUntil).toBeTruthy();

      // Force unlock by setting locked_until to the past
      const past = new Date(Date.now() - 60000);
      await db
        .update(portalUsers)
        .set({ lockedUntil: past })
        .where(eq(portalUsers.id, user.id));

      // One wrong password after expiry: counter resets to 1, lock clears
      await attemptLogin(user.email, 'wrong-password');

      row = await findPortalUser(user.id);
      expect(row?.failedLoginAttempts).toBe(1);
      expect(row?.lockedUntil).toBeNull();
    });

    it('successful login clears lockout state and resets counter', async () => {
      const user = await seedPortalUser();

      // Fail a few times (fewer than 5)
      for (let i = 0; i < 3; i++) {
        await attemptLogin(user.email, 'wrong-password');
      }

      // Verify counter incremented
      let row = await findPortalUser(user.id);
      expect(row?.failedLoginAttempts).toBe(3);
      expect(row?.lockedUntil).toBeNull();

      // Successful login
      const res = await attemptLogin(user.email, user.password);
      expect(res.status).toBe(200);
      const body = await json<{ token: string }>(res);
      expect(body.token).toBeTruthy();

      // Verify counter and lock cleared
      row = await findPortalUser(user.id);
      expect(row?.failedLoginAttempts).toBe(0);
      expect(row?.lockedUntil).toBeNull();
    });
  });

  /**
   * Forgot password: always 204, unknown addresses included (no enumeration).
   * If email matches: creates a reset token, sends email.
   */
  describe('forgot password', () => {
    it('returns 204 for unknown email and writes no row', async () => {
      const unknownEmail = 'unknown+test@example.com';

      // Count total reset rows before the request.
      const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
      const beforeCount = (await db.select().from(portalPasswordResets)).length;

      const res = await request('/portal/auth/forgot-password', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email: unknownEmail, turnstileToken: 'tok-test' }),
      });

      expect(res.status).toBe(204);

      // Verify no reset row was created (count unchanged).
      const afterCount = (await db.select().from(portalPasswordResets)).length;
      expect(afterCount).toBe(beforeCount);
    });

    it('returns 204 for known email and creates reset record', async () => {
      const user = await seedPortalUser();

      const res = await request('/portal/auth/forgot-password', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email: user.email, turnstileToken: 'tok-test' }),
      });

      expect(res.status).toBe(204);

      // Verify reset row was created
      const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
      const resets = await db
        .select()
        .from(portalPasswordResets)
        .where(eq(portalPasswordResets.portalUserId, user.id));
      expect(resets.length).toBeGreaterThan(0);
      expect(resets[0]?.tokenHash).toBeTruthy();
      expect(resets[0]?.usedAt).toBeNull();
    });
  });

  /**
   * Reset password: validate token, set password, mark used.
   */
  describe('reset password', () => {
    it('resets password with valid token and marks it used', async () => {
      const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
      const user = await seedPortalUser();
      const newPassword = 'new-secure-password-123';

      // Request password reset
      const res1 = await request('/portal/auth/forgot-password', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email: user.email, turnstileToken: 'tok-test' }),
      });
      expect(res1.status).toBe(204);

      // Get the created reset record (we don't have the token, so we'd need to mock it in real usage)
      // For this test, we'll create a reset manually to get a token
      const plainToken = 'test-reset-token-12345678901234567890';
      const tokenHash = await hashResetToken(plainToken);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

      const [reset] = await db
        .insert(portalPasswordResets)
        .values({
          portalUserId: user.id,
          tokenHash,
          expiresAt,
        })
        .returning();

      if (!reset) throw new Error('reset creation failed');

      // Now reset the password with the token
      const res2 = await request('/portal/auth/reset-password', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ token: plainToken, password: newPassword }),
      });

      expect(res2.status).toBe(200);
      const body = await json<{ changed: boolean }>(res2);
      expect(body.changed).toBe(true);

      // Verify reset token is marked used
      const updatedReset = await db
        .select()
        .from(portalPasswordResets)
        .where(eq(portalPasswordResets.id, reset.id))
        .limit(1);
      expect(updatedReset[0]?.usedAt).toBeTruthy();
    });

    it('rejects token when already used', async () => {
      const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
      const user = await seedPortalUser();
      const plainToken = 'test-reset-token-used-1234567890123';
      const tokenHash = await hashResetToken(plainToken);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

      // Create a reset token
      const [reset] = await db
        .insert(portalPasswordResets)
        .values({
          portalUserId: user.id,
          tokenHash,
          expiresAt,
        })
        .returning();

      if (!reset) throw new Error('reset creation failed');

      // Mark it as used
      await db
        .update(portalPasswordResets)
        .set({ usedAt: now })
        .where(eq(portalPasswordResets.id, reset.id));

      // Try to use it again
      const res = await request('/portal/auth/reset-password', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ token: plainToken, password: 'new-password-123' }),
      });

      expect(res.status).toBe(400);
      const body = await json<{ error: string }>(res);
      expect(body.error).toBe('invalid_or_expired_token');
    });

    it('rejects token when expired', async () => {
      const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
      const user = await seedPortalUser();
      const plainToken = 'test-reset-token-expired-123456789';
      const tokenHash = await hashResetToken(plainToken);
      const now = new Date();
      const expiredAt = new Date(now.getTime() - 60000); // 1 minute ago

      // Create an expired reset token
      const [reset] = await db
        .insert(portalPasswordResets)
        .values({
          portalUserId: user.id,
          tokenHash,
          expiresAt: expiredAt,
        })
        .returning();

      if (!reset) throw new Error('reset creation failed');

      // Try to use it
      const res = await request('/portal/auth/reset-password', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ token: plainToken, password: 'new-password-123' }),
      });

      expect(res.status).toBe(400);
      const body = await json<{ error: string }>(res);
      expect(body.error).toBe('invalid_or_expired_token');
    });

    it('rejects invalid token', async () => {
      const res = await request('/portal/auth/reset-password', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ token: 'nonexistent-token-12345678901', password: 'new-password-123' }),
      });

      expect(res.status).toBe(400);
      const body = await json<{ error: string }>(res);
      expect(body.error).toBe('invalid_or_expired_token');
    });
  });

  /**
   * Reset throttle: max 3 unused live tokens per account, newest wins.
   */
  describe('reset throttle', () => {
    it('keeps exactly the 3 newest live tokens and prunes the rest', async () => {
      const user = await seedPortalUser();

      for (let i = 0; i < 5; i++) {
        const res = await request('/portal/auth/forgot-password', {
          method: 'POST',
          headers: jsonHeaders(),
          body: JSON.stringify({ email: user.email, turnstileToken: 'tok-test' }),
        });
        expect(res.status).toBe(204);
      }

      const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
      const resets = await db
        .select()
        .from(portalPasswordResets)
        .where(eq(portalPasswordResets.portalUserId, user.id));

      expect(resets.length).toBe(5);

      const live = resets.filter((r) => !r.usedAt);
      // Exactly 3 — not "at most 3", which a prune that killed everything, or a
      // create that silently inserted nothing, would also satisfy.
      expect(live.length).toBe(3);

      // And they must be the NEWEST three. Invert the sort in pruneOldResets and
      // the just-mailed link is dead while a length-only assertion stays green.
      const newestThree = [...resets]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 3)
        .map((r) => r.id)
        .sort();
      expect(live.map((r) => r.id).sort()).toEqual(newestThree);
    });

    it('mails a working link: the token in the email is the one stored, hashed', async () => {
      const user = await seedPortalUser();

      const res = await request('/portal/auth/forgot-password', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email: user.email, turnstileToken: 'tok-test' }),
      });
      expect(res.status).toBe(204);

      // The link has been wrong twice: once aimed at a POST-only API route, once
      // at a path that was being renamed. Both were green until someone clicked.
      const sent = lastResendSend();
      expect(sent).toBeTruthy();
      expect(sent!.to).toBe(user.email);
      const match = /https?:\/\/[^"'\s]*\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(sent!.html ?? '');
      expect(match).toBeTruthy();

      // ...and that token must be the one whose hash is at rest, which is what
      // makes the mailed link actually redeemable.
      const mailedToken = decodeURIComponent(match![1]!);
      const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
      const [row] = await db
        .select()
        .from(portalPasswordResets)
        .where(eq(portalPasswordResets.portalUserId, user.id));
      expect(row!.tokenHash).toBe(await hashResetToken(mailedToken));

      const used = await request('/portal/auth/reset-password', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ token: mailedToken, password: 'brand-new-passw0rd' }),
      });
      expect(used.status).toBe(200);
    });

    it('rejects login and forgot-password when Turnstile fails', async () => {
      const user = await seedPortalUser();
      setTurnstileVerdict(false);

      const login = await request('/portal/auth/login', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email: user.email, password: user.password, turnstileToken: 'tok-bad' }),
      });
      expect(login.status).toBe(403);

      const forgot = await request('/portal/auth/forgot-password', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email: user.email, turnstileToken: 'tok-bad' }),
      });
      expect(forgot.status).toBe(403);
    });

    it('refuses a reset to a suspended account and does not reactivate it', async () => {
      const user = await seedPortalUser();
      const db = createDb((env as unknown as WorkerEnv).DATABASE_URL);
      await db
        .update(portalUsers)
        .set({ status: PortalUserStatus.Suspended })
        .where(eq(portalUsers.id, user.id));

      const forgot = await request('/portal/auth/forgot-password', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email: user.email, turnstileToken: 'tok-test' }),
      });
      // Still 204 — saying "suspended" would confirm the address exists.
      expect(forgot.status).toBe(204);

      // But no token was minted, so there is nothing to redeem.
      const rows = await db
        .select()
        .from(portalPasswordResets)
        .where(eq(portalPasswordResets.portalUserId, user.id));
      expect(rows.length).toBe(0);

      const [after] = await db
        .select()
        .from(portalUsers)
        .where(eq(portalUsers.id, user.id));
      expect(after!.status).toBe(PortalUserStatus.Suspended);
    });
  });
  /**
   * Suspended and revoked accounts name themselves at login (owner 2026-09-05,
   * superseding 02 §3's identical body). A locked account still does not — that
   * lock is usually the attacker's own doing.
   */
  describe('accounts staff turned off', () => {
    const db = () => createDb((env as unknown as WorkerEnv).DATABASE_URL);

    async function login(email: string, password: string) {
      return request('/portal/auth/login', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ email, password, turnstileToken: 'tok-test' }),
      });
    }

    it('tells a suspended account it is disabled, right password or not', async () => {
      const user = await seedPortalUser();
      await db()
        .update(portalUsers)
        .set({ status: PortalUserStatus.Suspended })
        .where(eq(portalUsers.id, user.id));

      const right = await login(user.email, user.password);
      expect(right.status).toBe(401);
      const body = await json<{ error: string; message?: string }>(right);
      expect(body.error).toBe('account_suspended');
      expect(body.message).toBeTruthy();

      // The refusal precedes password verification, so it is no password
      // oracle and never feeds the A3 counter.
      const wrong = await login(user.email, 'wrong-password');
      expect(wrong.status).toBe(401);
      expect((await json<{ error: string }>(wrong)).error).toBe('account_suspended');

      const [after] = await db()
        .select()
        .from(portalUsers)
        .where(eq(portalUsers.id, user.id));
      expect(after!.failedLoginAttempts).toBe(0);
    });

    it('answers the same for a revoked account the login lookup still sees', async () => {
      const user = await seedPortalUser();
      await db()
        .update(portalUsers)
        .set({ deletedAt: new Date() })
        .where(eq(portalUsers.id, user.id));

      const res = await login(user.email, user.password);
      expect(res.status).toBe(401);
      expect((await json<{ error: string }>(res)).error).toBe('account_suspended');
    });

    it('still hides a locked account behind invalid_credentials', async () => {
      const user = await seedPortalUser();
      await db()
        .update(portalUsers)
        .set({ lockedUntil: new Date(Date.now() + 60 * 60 * 1000) })
        .where(eq(portalUsers.id, user.id));

      const res = await login(user.email, user.password);
      expect(res.status).toBe(401);
      expect((await json<{ error: string }>(res)).error).toBe('invalid_credentials');
    });
  });
});
