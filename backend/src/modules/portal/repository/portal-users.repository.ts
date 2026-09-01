import { isNull, eq, and } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { portalUsers } from '../models/portal-users.model';
import { portalUserGrants } from '../models/portal-user-grants.model';

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
