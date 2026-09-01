import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { request, json, jsonHeaders, env } from '../helpers';
import { seedPortalUser } from '../helpers/fixtures';
import { createDb } from '../../src/modules/database/client';
import { portalUsers } from '../../src/modules/database/schema';

type WorkerEnv = { DATABASE_URL: string };

/**
 * Portal auth tests — login, me, password change, and A3 lockout (5 fails → 2h cooldown).
 */
describe('portal auth', () => {
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
        body: JSON.stringify({ email, password }),
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
});
