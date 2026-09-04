import { isNull, eq, and, ne, or, desc, ilike, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../database/client';
import { portalUsers } from '../models/portal-users.model';
import { portalUserGrants } from '../models/portal-user-grants.model';
import { PortalUserStatus } from '../enums/portal-users.enum';
import { PortalGrant } from '../enums/portal-grants.enum';
import type { NewPortalUser, PortalUserListRow } from '../types/portal.types';
import type { ListPortalUsersQuery } from '../validators/portal-users-query.validator';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import { customers } from '../../customers/models/customers.model';
import { customerContacts } from '../../customers/models/customer-contacts.model';
import { users } from '../../users/models/users.model';

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
 * The login lookup: same email, soft-deleted rows included, live row first.
 * Login is the one read that must see a revoked account — it answers those
 * `account_suspended` rather than "wrong password" (owner 2026-09-05). Every
 * other read stays on `findPortalUserByEmail`.
 */
export async function findPortalUserByEmailForLogin(db: Db, email: string) {
  const result = await db
    .select()
    .from(portalUsers)
    .where(eq(portalUsers.email, email))
    .orderBy(sql`${portalUsers.deletedAt} nulls first`, desc(portalUsers.createdAt))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Find the live portal user for a contact, if any.
 *
 * This — not email — is the key `portal_users_contact_active_idx` enforces
 * (A10: one active portal user per contact). Guarding on email misses the case
 * where the contact's address was edited after the invite, and the insert then
 * trips the contact index as an unhandled 23505.
 */
export async function findPortalUserByContactId(db: Db, contactId: string) {
  const result = await db
    .select()
    .from(portalUsers)
    .where(and(eq(portalUsers.contactId, contactId), isNull(portalUsers.deletedAt)))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Which of these contact ids currently hold a live portal user — the
 * quotation-send email's portal link (superadmin 26 §6 rollout companion).
 * "Live" means not soft-deleted; a revoked account is no different from never
 * having had one for this purpose. Batched, mirroring
 * `findContactsForCustomer`, rather than one round trip per recipient.
 */
export async function findContactIdsWithLivePortalUser(
  db: Db,
  contactIds: string[],
): Promise<string[]> {
  if (contactIds.length === 0) return [];
  const rows = await db
    .select({ contactId: portalUsers.contactId })
    .from(portalUsers)
    .where(and(inArray(portalUsers.contactId, contactIds), isNull(portalUsers.deletedAt)));

  return rows.map((r) => r.contactId);
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
 * How many portal users can still act as this customer's admin.
 *
 * Counts effective admins, not rows: a suspended admin cannot log in, so it
 * cannot close a request either, and counting it would silence the warning in
 * exactly the case that needs it. Soft-deleted rows are out for the same reason.
 * `invited` counts — that account has a working temp password.
 */
export async function countEffectiveCustomerAdmins(db: Db, customerId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(portalUsers)
    .where(
      and(
        eq(portalUsers.customerId, customerId),
        eq(portalUsers.isAdmin, true),
        isNull(portalUsers.deletedAt),
        ne(portalUsers.status, PortalUserStatus.Suspended),
      ),
    );

  return result[0]?.count ?? 0;
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
 * Every live contact of a customer (07), left-joined to their portal user if
 * one exists — backs the customer detail page's per-contact access indicator
 * (superadmin 26 §6, CP-5). Every contact gets a row, whether or not they
 * were ever invited; `status`/`portalUserId`/`lastLoginAt` come back null
 * when there is none.
 *
 * Keyed on `contactId`, never email: `portal_users.email` is independent of
 * the contact's own address after invite (see `invitePortalUser`'s own
 * comment), so an email join would report "no access" for someone who can
 * still log in.
 *
 * A soft-deleted portal user is excluded from the join, same as every other
 * read here — a revoked login is no access, not a stale status.
 */
export async function findPortalAccessForCustomerContacts(db: Db, customerId: string) {
  return db
    .select({
      contactId: customerContacts.id,
      portalUserId: portalUsers.id,
      status: portalUsers.status,
      lastLoginAt: portalUsers.lastLoginAt,
    })
    .from(customerContacts)
    .leftJoin(
      portalUsers,
      and(eq(portalUsers.contactId, customerContacts.id), isNull(portalUsers.deletedAt)),
    )
    .where(and(eq(customerContacts.customerId, customerId), isNull(customerContacts.deletedAt)));
}

/**
 * Find active grants for a portal user (revoked_at is null).
 * A grant row with revoked_at set is the record that access once existed,
 * never reused.
 */
export async function findGrantsByPortalUser(db: DbOrTx, portalUserId: string) {
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
 * Set a portal user's password: clears `must_change_password`, clears the A3
 * lockout, and promotes **only** `invited` to `active`.
 *
 * Two deliberate constraints:
 *
 * 1. `suspended` is never promoted. Setting a password is not a route back in —
 *    only staff resume an account (02 CP-4). The `WHERE` clause enforces it in
 *    SQL rather than in the caller, because the public reset flow reaches this
 *    from an unauthenticated request and must not be able to reactivate.
 * 2. The lockout is cleared (owner, 2026-09-01). A user who forgets their
 *    password, fails five logins and then resets would otherwise still be
 *    refused for up to two hours with no explanation — and superadmin 26 §1
 *    says there is no unlock action to build, so this is the only lever.
 *
 * Returns null when the row is absent, soft-deleted, or suspended.
 */
export async function updatePortalUserPassword(
  db: DbOrTx,
  portalUserId: string,
  passwordHash: string,
) {
  const now = new Date();
  const updated = await db
    .update(portalUsers)
    .set({
      passwordHash,
      mustChangePassword: false,
      // `invited` graduates on first password; `active` stays active.
      // `suspended` never reaches here — excluded by the WHERE below.
      status: PortalUserStatus.Active,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(portalUsers.id, portalUserId),
        isNull(portalUsers.deletedAt),
        ne(portalUsers.status, PortalUserStatus.Suspended),
      ),
    )
    .returning();

  return updated[0] ?? null;
}

/**
 * Staff operation: create a new portal user (invite flow).
 * Returns the created row.
 */
export async function createPortalUser(db: DbOrTx, values: NewPortalUser) {
  const now = new Date();
  const [row] = await db
    .insert(portalUsers)
    .values({
      ...values,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) throw new Error('createPortalUser returned no row');
  return row;
}

/**
 * Staff operation: create portal user grants in bulk.
 * Returns the created rows.
 */
export async function createPortalUserGrants(
  db: DbOrTx,
  portalUserId: string,
  grants: PortalGrant[],
  grantedBy: string,
) {
  if (grants.length === 0) return [];

  const now = new Date();
  const rows = await db
    .insert(portalUserGrants)
    .values(
      grants.map((grant) => ({
        portalUserId,
        grant,
        grantedBy,
        createdAt: now,
      })),
    )
    .returning();

  return rows;
}

/**
 * Staff operation: change portal user status (suspend/resume).
 * Returns the updated row or null if not found.
 */
export async function updatePortalUserStatus(
  db: DbOrTx,
  portalUserId: string,
  status: PortalUserStatus,
) {
  const now = new Date();
  const updated = await db
    .update(portalUsers)
    .set({
      status,
      updatedAt: now,
    })
    .where(and(eq(portalUsers.id, portalUserId), isNull(portalUsers.deletedAt)))
    .returning();

  return updated[0] ?? null;
}

/**
 * Staff operation: set a temporary password with mustChangePassword flag.
 * Used for staff-issued resets.
 * Returns the updated row or null if not found.
 */
export async function setPortalUserTempPassword(
  db: DbOrTx,
  portalUserId: string,
  passwordHash: string,
) {
  const now = new Date();
  const updated = await db
    .update(portalUsers)
    .set({
      passwordHash,
      mustChangePassword: true,
      // Clear the A3 lockout (owner, 2026-09-01). Support's only lever: 26 §1
      // says there is no unlock action to build, so a staff reset that left the
      // lock in place would hand the user a password refused for two more hours.
      // Status is deliberately NOT touched — resuming a suspended account is a
      // separate, explicit staff action.
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    })
    .where(and(eq(portalUsers.id, portalUserId), isNull(portalUsers.deletedAt)))
    .returning();

  return updated[0] ?? null;
}

/**
 * Staff operation: set `is_admin` independently of the grants (superadmin 26
 * §3b). Not a `portal_user_grants` row — a plain column write, called only
 * when the caller actually included the key. Returns the updated row or null
 * if not found.
 */
export async function updatePortalUserIsAdmin(
  db: DbOrTx,
  portalUserId: string,
  isAdmin: boolean,
) {
  const now = new Date();
  const updated = await db
    .update(portalUsers)
    .set({
      isAdmin,
      updatedAt: now,
    })
    .where(and(eq(portalUsers.id, portalUserId), isNull(portalUsers.deletedAt)))
    .returning();

  return updated[0] ?? null;
}

/**
 * Staff operation: revoke a grant (set revokedAt and revokedBy).
 * No-op if the grant doesn't exist or is already revoked.
 * Returns the updated row.
 */
export async function revokePortalUserGrant(
  db: DbOrTx,
  grantId: string,
  revokedBy: string,
) {
  const now = new Date();
  const updated = await db
    .update(portalUserGrants)
    .set({
      revokedAt: now,
      revokedBy,
    })
    .where(eq(portalUserGrants.id, grantId))
    .returning();

  return updated[0] ?? null;
}

/**
 * Staff operation: soft delete a portal user (revoke access without deleting the row).
 * Returns the updated row or null if not found.
 */
export async function softDeletePortalUser(
  db: DbOrTx,
  portalUserId: string,
  deletedBy: string,
  deleteComment?: string,
) {
  const now = new Date();
  const updated = await db
    .update(portalUsers)
    .set({
      deletedAt: now,
      deletedBy,
      deleteComment: deleteComment ?? null,
      updatedAt: now,
    })
    .where(and(eq(portalUsers.id, portalUserId), isNull(portalUsers.deletedAt)))
    .returning();

  return updated[0] ?? null;
}

/**
 * Tenant-wide paged list for superadmin 26 §1.
 *
 * Two rounds on purpose: the page of users, then their live grants in one
 * `inArray` read. Joining grants into the main query would multiply rows per
 * grant and make `LIMIT` mean something other than "20 users", which is the
 * classic way a paged list quietly returns 6 people on a page of 20.
 *
 * `total` is a `count(*)` over the same filter — never `items.length`, which is
 * only ever the size of the current page.
 */
export async function listPortalUsersPaged(
  db: Db,
  query: ListPortalUsersQuery,
): Promise<GenericQueryResponse<PortalUserListRow>> {
  const filters: SQL[] = [isNull(portalUsers.deletedAt)];
  if (query.status) filters.push(eq(portalUsers.status, query.status));
  if (query.customerId) filters.push(eq(portalUsers.customerId, query.customerId));
  if (query.search) {
    const term = `%${query.search}%`;
    const match = or(
      ilike(portalUsers.name, term),
      ilike(portalUsers.paternalLastName, term),
      ilike(portalUsers.maternalLastName, term),
      ilike(portalUsers.email, term),
    );
    if (match) filters.push(match);
  }
  if (query.grant) {
    // EXISTS rather than a join: the row must hold the grant, but we still want
    // one row per user and all of their grants attached below.
    filters.push(
      sql`exists (
        select 1 from ${portalUserGrants} g
        where g.portal_user_id = ${portalUsers.id}
          and g.grant = ${query.grant}
          and g.revoked_at is null
      )`,
    );
  }
  const where = and(...filters);

  const rows = await db
    .select({
      user: portalUsers,
      customerName: customers.name,
      invitedByName: users.name,
    })
    .from(portalUsers)
    .leftJoin(customers, eq(customers.id, portalUsers.customerId))
    .leftJoin(users, eq(users.id, portalUsers.invitedBy))
    .where(where)
    .orderBy(desc(portalUsers.createdAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(portalUsers)
    .where(where);

  const ids = rows.map((r) => r.user.id);
  const grantRows = ids.length
    ? await db
        .select({ portalUserId: portalUserGrants.portalUserId, grant: portalUserGrants.grant })
        .from(portalUserGrants)
        .where(
          and(inArray(portalUserGrants.portalUserId, ids), isNull(portalUserGrants.revokedAt)),
        )
    : [];

  const grantsByUser = new Map<string, PortalGrant[]>();
  for (const g of grantRows) {
    const list = grantsByUser.get(g.portalUserId) ?? [];
    list.push(g.grant);
    grantsByUser.set(g.portalUserId, list);
  }

  return {
    items: rows.map((r) => ({
      ...r.user,
      customerName: r.customerName,
      invitedByName: r.invitedByName,
      grants: grantsByUser.get(r.user.id) ?? [],
    })),
    total: countRows[0]?.count ?? 0,
    page: query.page,
    limit: query.limit,
  };
}
