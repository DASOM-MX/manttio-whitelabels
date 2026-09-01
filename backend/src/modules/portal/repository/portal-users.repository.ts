import { isNull, eq, and, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { portalUsers } from '../models/portal-users.model';
import { portalUserGrants } from '../models/portal-user-grants.model';
import { PortalUserStatus } from '../enums/portal-users.enum';

/**
 * Find a portal user by email, filtering out soft-deleted rows.
 * The partial-unique index on email (isNull(deleted_at)) makes this unambiguous —
 * a revoked account never blocks a re-invite of the same address.
 */
export async function findPortalUserByEmail(db: Db, email: string) {
  const result = await db
    .select()
    .from(portalUsers)
    .where(and(eq(portalUsers.email, email), isNull(portalUsers.deletedAt)))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Find a portal user by ID, filtering out soft-deleted rows.
 */
export async function findPortalUserById(db: Db, id: string) {
  const result = await db
    .select()
    .from(portalUsers)
    .where(and(eq(portalUsers.id, id), isNull(portalUsers.deletedAt)))
    .limit(1);

  return result[0] ?? null;
}

/**
 * List active portal users for a customer.
 */
export async function listPortalUsersByCustomer(db: Db, customerId: string) {
  const result = await db
    .select()
    .from(portalUsers)
    .where(
      and(
        eq(portalUsers.customerId, customerId),
        isNull(portalUsers.deletedAt),
      ),
    );

  return result;
}

/**
 * Find active grants for a portal user (revoked_at is null).
 * A grant row with revoked_at set is the record that access once existed,
 * never reused.
 */
export async function findGrantsByPortalUser(db: Db, portalUserId: string) {
  const result = await db
    .select()
    .from(portalUserGrants)
    .where(
      and(
        eq(portalUserGrants.portalUserId, portalUserId),
        isNull(portalUserGrants.revokedAt),
      ),
    );

  return result;
}

/**
 * Check if a portal user is currently locked (locked_until is in the future).
 */
export function isPortalUserLocked(lockedUntil: Date | null): boolean {
  if (!lockedUntil) return false;
  return lockedUntil > new Date();
}

/**
 * Increment failed login attempts and apply lockout if needed (A3: 5 fails → 2h cooldown).
 * Atomic: does not leak to race conditions. Self-clearing: if the lock has expired,
 * reset the counter to 1 before checking the threshold.
 * Returns the updated portal user row.
 */
export async function incrementFailedLoginAttempts(db: Db, portalUserId: string) {
  const now = new Date();
  const twoHoursAhead = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  // Atomic single statement: conditionally reset counter if lock has expired,
  // increment by 1, then set lock to 2h ahead if new count >= 5.
  // Timestamps must be explicitly cast to timestamptz for Postgres assignment context.
  const updated = await db
    .update(portalUsers)
    .set({
      failedLoginAttempts: sql`
        CASE
          WHEN ${portalUsers.lockedUntil} IS NOT NULL AND ${portalUsers.lockedUntil} <= ${now}::timestamptz
            THEN 1
          ELSE ${portalUsers.failedLoginAttempts} + 1
        END
      `,
      lockedUntil: sql`
        CASE
          WHEN (
            CASE
              WHEN ${portalUsers.lockedUntil} IS NOT NULL AND ${portalUsers.lockedUntil} <= ${now}::timestamptz
                THEN 1
              ELSE ${portalUsers.failedLoginAttempts} + 1
            END
          ) >= 5
            THEN ${twoHoursAhead}::timestamptz
          ELSE NULL
        END
      `,
      updatedAt: now,
    })
    .where(eq(portalUsers.id, portalUserId))
    .returning();

  return updated[0] ?? null;
}

/**
 * Clear lockout and failed attempts on a successful login.
 * Returns the updated portal user row.
 */
export async function clearPortalUserLockout(db: Db, portalUserId: string) {
  const now = new Date();
  const updated = await db
    .update(portalUsers)
    .set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: now,
      updatedAt: now,
    })
    .where(eq(portalUsers.id, portalUserId))
    .returning();

  return updated[0] ?? null;
}

/**
 * Update a portal user's password and clear must_change_password flag.
 * Returns the updated row or null if not found.
 */
export async function updatePortalUserPassword(
  db: Db,
  portalUserId: string,
  passwordHash: string,
) {
  const now = new Date();
  const updated = await db
    .update(portalUsers)
    .set({
      passwordHash,
      mustChangePassword: false,
      status: PortalUserStatus.Active,
      updatedAt: now,
    })
    .where(eq(portalUsers.id, portalUserId))
    .returning();

  return updated[0] ?? null;
}
