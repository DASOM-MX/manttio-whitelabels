import { isNull, eq, and, gt } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { portalPasswordResets } from '../models/portal-password-resets.model';

/**
 * Create a new password reset token record with a 1h TTL. The token itself is hashed;
 * the plaintext token is returned to be mailed, never stored.
 */
export async function createPasswordReset(
  db: Db,
  portalUserId: string,
  tokenHash: string,
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1h

  const [row] = await db
    .insert(portalPasswordResets)
    .values({
      portalUserId,
      tokenHash,
      expiresAt,
    })
    .returning();

  return row ?? null;
}

/**
 * Find a password reset by token hash, filtering out used or expired records.
 */
export async function findPasswordResetByTokenHash(db: Db, tokenHash: string) {
  const now = new Date();
  const result = await db
    .select()
    .from(portalPasswordResets)
    .where(
      and(
        eq(portalPasswordResets.tokenHash, tokenHash),
        isNull(portalPasswordResets.usedAt),
        gt(portalPasswordResets.expiresAt, now),
      ),
    )
    .limit(1);

  return result[0] ?? null;
}

/**
 * Mark a password reset as used (consumed).
 */
export async function markPasswordResetAsUsed(db: Db, resetId: string) {
  const now = new Date();
  const [row] = await db
    .update(portalPasswordResets)
    .set({ usedAt: now })
    .where(eq(portalPasswordResets.id, resetId))
    .returning();

  return row ?? null;
}

/**
 * Count unused, non-expired reset tokens for a portal user.
 * Used for throttling: max 3 unused live tokens, newest wins.
 */
export async function countUnusedResets(db: Db, portalUserId: string) {
  const now = new Date();
  const result = await db
    .select({ id: portalPasswordResets.id })
    .from(portalPasswordResets)
    .where(
      and(
        eq(portalPasswordResets.portalUserId, portalUserId),
        isNull(portalPasswordResets.usedAt),
        gt(portalPasswordResets.expiresAt, now),
      ),
    );

  return result.length;
}

/**
 * Prune old unused reset tokens when creating a new one (throttle: max 3 per account,
 * newest wins). Marks as used any unused token beyond the 3rd most recent.
 */
export async function pruneOldResets(db: Db, portalUserId: string) {
  // Find all unused tokens for this user, ordered by createdAt ASC (oldest first).
  // Take the first N-3 (if any); mark them as used.
  const unused = await db
    .select({ id: portalPasswordResets.id, createdAt: portalPasswordResets.createdAt })
    .from(portalPasswordResets)
    .where(
      and(
        eq(portalPasswordResets.portalUserId, portalUserId),
        isNull(portalPasswordResets.usedAt),
      ),
    )
    .orderBy((t) => t.createdAt); // Oldest first

  // If there are more than 3, mark the older ones as used
  if (unused.length > 3) {
    const idsToMark = unused.slice(0, unused.length - 3).map((r) => r.id);
    const now = new Date();
    for (const id of idsToMark) {
      await db
        .update(portalPasswordResets)
        .set({ usedAt: now })
        .where(eq(portalPasswordResets.id, id));
    }
  }
}
