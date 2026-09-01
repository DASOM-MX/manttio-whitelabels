import { isNull, eq, and, gt, inArray } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../database/client';
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
 * Consume a reset token — stamp `used_at`, but only while it is still unused
 * and unexpired.
 *
 * The `used_at IS NULL` predicate is the concurrency guard: two requests
 * carrying the same token race on this single statement and exactly one gets a
 * row back. That is why the caller consumes *before* writing the password —
 * the loser stops with the password unchanged, rather than both succeeding.
 *
 * `usedAt` means invalidated: either consumed here, or superseded by a newer
 * token from the same account (throttle). There is no column separating the
 * two and adding one would need a migration.
 */
export async function consumePasswordReset(db: DbOrTx, resetId: string) {
  const now = new Date();
  const [row] = await db
    .update(portalPasswordResets)
    .set({ usedAt: now })
    .where(
      and(
        eq(portalPasswordResets.id, resetId),
        isNull(portalPasswordResets.usedAt),
        gt(portalPasswordResets.expiresAt, now),
      ),
    )
    .returning();

  return row ?? null;
}

/**
 * Prune old unused reset tokens when creating a new one (throttle: max 3 per account,
 * newest wins). Marks as invalidated any unused, live (non-expired) token beyond the
 * 3rd most recent.
 */
export async function pruneOldResets(db: Db, portalUserId: string) {
  const now = new Date();

  // Find all unused, live (non-expired) tokens for this user, ordered by
  // createdAt ASC (oldest first). Keep the 3 newest; mark the rest as invalidated.
  const unused = await db
    .select({ id: portalPasswordResets.id, createdAt: portalPasswordResets.createdAt })
    .from(portalPasswordResets)
    .where(
      and(
        eq(portalPasswordResets.portalUserId, portalUserId),
        isNull(portalPasswordResets.usedAt),
        gt(portalPasswordResets.expiresAt, now),
      ),
    )
    .orderBy((t) => t.createdAt); // Oldest first

  // If there are more than 3 live tokens, invalidate the oldest ones.
  if (unused.length > 3) {
    const idsToMark = unused.slice(0, unused.length - 3).map((r) => r.id);
    await db
      .update(portalPasswordResets)
      .set({ usedAt: now })
      .where(inArray(portalPasswordResets.id, idsToMark));
  }
}
