import type { Db } from '../../database/client';
import type { AuthUser } from '../../../env';
import type { PortalGrant } from '../enums/portal-grants.enum';
import { PortalUserStatus } from '../enums/portal-users.enum';
import { hashPassword } from '../../auth/services/password.service';
import { isUniqueViolation } from '../../database/db-errors';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import type { PortalUserListItem } from '../dtos/portal-user-list.dto';
import type { ListPortalUsersQuery } from '../validators/portal-users-query.validator';
// CSPRNG-backed and unbiased (nanoid customAlphabet), and already the temp
// password every staff-created user gets. A portal credential is not the place
// for a second, weaker generator.
import { generateTempPassword } from '../../users/utils/temp-password';
import {
  createPortalUser,
  createPortalUserGrants,
  findPortalUserById,
  findGrantsByPortalUser,
  updatePortalUserStatus,
  setPortalUserTempPassword,
  revokePortalUserGrant,
  softDeletePortalUser,
  findPortalUserByContactId,
  listPortalUsersPaged,
} from '../repository/portal-users.repository';
import { findContactById } from '../../customers/repository/customer-contacts.repository';
import { sendPortalUserInviteEmail, sendPortalPasswordResetEmail } from '../helpers/portal-email.helpers';
import type { Env } from '../../../env';

export class ContactNotFoundError extends Error {}
export class ContactHasNoEmailError extends Error {}
export class PortalUserAlreadyExistsError extends Error {}
export class PortalUserNotFoundError extends Error {}

/**
 * Invite a contact to become a portal user. Creates the portal_users row,
 * inserts grant rows, generates a temporary password, and sends an invite email.
 *
 * Returns the created portal user (without the temp password — that goes in the email only).
 */
export async function invitePortalUser(
  db: Db,
  env: Env,
  actor: AuthUser,
  contactId: string,
  grants: PortalGrant[],
  isAdmin: boolean,
): Promise<{ id: string; email: string; name: string; customerId: string }> {
  // Step 1: Validate the contact exists and has an email
  const contact = await findContactById(db, contactId);
  if (!contact) throw new ContactNotFoundError('Contact not found');
  if (!contact.email) throw new ContactHasNoEmailError('Contact has no email address');

  // Step 2: Check if a portal user already exists for this contact.
  // Keyed on contactId, which is what portal_users_contact_active_idx actually
  // enforces — an email guard misses a contact whose address changed after the
  // first invite, and the insert then raises 23505 as a 500.
  const existing = await findPortalUserByContactId(db, contactId);
  if (existing) throw new PortalUserAlreadyExistsError('Portal user already exists for this contact');

  // Step 3: Generate a temporary password
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  // Step 4: Create the portal user in a transaction.
  // The contactId guard above closes the ordinary case; this catch closes the
  // race between that read and this insert, turning the unique-index violation
  // into the same 409 instead of a 500.
  const portalUser = await db.transaction(async (tx) => {
    // Create the portal user
    const user = await createPortalUser(tx, {
      contactId,
      customerId: contact.customerId,
      email: contact.email!,
      passwordHash,
      name: contact.name,
      paternalLastName: null,
      maternalLastName: null,
      role: contact.role || null,
      isAdmin,
      invitedBy: actor.id,
    });

    // Create grant rows
    if (grants.length > 0) {
      await createPortalUserGrants(tx, user.id, grants, actor.id);
    }

    return user;
  }).catch((err) => {
    if (isUniqueViolation(err)) {
      throw new PortalUserAlreadyExistsError('Portal user already exists for this contact');
    }
    throw err;
  });

  // Step 5: Send the invite email (outside the transaction so it doesn't roll back on email failure)
  try {
    await sendPortalUserInviteEmail(db, env, contact.name, contact.email, tempPassword);
  } catch (err) {
    console.error('Failed to send portal user invite email:', err);
    // Don't throw — the account was created successfully; the email issue is noted but not fatal
  }

  return {
    id: portalUser.id,
    email: portalUser.email,
    name: portalUser.name,
    customerId: portalUser.customerId,
  };
}

/**
 * Update a portal user's grants. Revokes grants not in the list, creates new ones in the list.
 * Returns the updated grants list.
 */
export async function updatePortalUserGrants(
  db: Db,
  actor: AuthUser,
  portalUserId: string,
  newGrants: PortalGrant[],
): Promise<PortalGrant[]> {
  // Step 1: Validate the portal user exists
  const user = await findPortalUserById(db, portalUserId);
  if (!user) throw new PortalUserNotFoundError('Portal user not found');

  // Step 2: Load current grants
  const currentGrants = await findGrantsByPortalUser(db, portalUserId);
  const currentGrantSet = new Set(currentGrants.map((g) => g.grant));
  const newGrantSet = new Set(newGrants);

  // Step 3: Revoke grants not in the new list
  const grantsToRevoke = currentGrants.filter((g) => !newGrantSet.has(g.grant as PortalGrant));

  // Step 4: Identify grants to add
  const grantsToAdd = newGrants.filter((g) => !currentGrantSet.has(g));

  // Step 5: Execute in a transaction
  const updated = await db.transaction(async (tx) => {
    // Revoke old grants
    for (const grant of grantsToRevoke) {
      await revokePortalUserGrant(tx, grant.id, actor.id);
    }

    // Add new grants
    if (grantsToAdd.length > 0) {
      await createPortalUserGrants(tx, portalUserId, grantsToAdd, actor.id);
    }

    // Return the new grant list
    return findGrantsByPortalUser(tx, portalUserId);
  });

  return updated.map((g) => g.grant as PortalGrant);
}

/**
 * Suspend a portal user (set status to suspended).
 * Returns true on success, false if the user is not found.
 */
export async function suspendPortalUser(db: Db, portalUserId: string): Promise<boolean> {
  const result = await updatePortalUserStatus(db, portalUserId, PortalUserStatus.Suspended);
  return result !== null;
}

/**
 * Resume a portal user (set status back to active).
 * Returns true on success, false if the user is not found.
 */
export async function resumePortalUser(db: Db, portalUserId: string): Promise<boolean> {
  const result = await updatePortalUserStatus(db, portalUserId, PortalUserStatus.Active);
  return result !== null;
}

/**
 * Staff-issued password reset. Generates a new temporary password and sends it via email.
 * Sets mustChangePassword to true.
 * Returns the portal user info (without the password).
 */
export async function resetPortalUserPassword(
  db: Db,
  env: Env,
  portalUserId: string,
): Promise<{ id: string; email: string; name: string }> {
  // Step 1: Find the user
  const user = await findPortalUserById(db, portalUserId);
  if (!user) throw new PortalUserNotFoundError('Portal user not found');

  // Step 2: Generate a new temporary password
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  // Step 3: Update the password
  const updated = await setPortalUserTempPassword(db, portalUserId, passwordHash);
  if (!updated) throw new PortalUserNotFoundError('Portal user not found');

  // Step 4: Send the reset email (outside transaction)
  try {
    await sendPortalPasswordResetEmail(db, env, user.name, user.email, tempPassword);
  } catch (err) {
    console.error('Failed to send portal user password reset email:', err);
    // Don't throw — the password was updated; the email issue is noted but not fatal
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}

/**
 * Revoke portal access for a user (soft delete).
 * Returns true on success, false if the user is not found.
 */
export async function revokePortalUserAccess(
  db: Db,
  actor: AuthUser,
  portalUserId: string,
  // Required by the validator (26 §4) — typed non-optional here so a future
  // caller cannot quietly drop the audit trail.
  deleteComment: string,
): Promise<boolean> {
  const result = await softDeletePortalUser(db, portalUserId, actor.id, deleteComment);
  return result !== null;
}

/**
 * Get a portal user for admin display (used in staff side for portal-user list/detail).
 * Includes grants.
 */
export async function getPortalUserForAdmin(
  db: Db,
  portalUserId: string,
): Promise<{ id: string; email: string; name: string; status: string; isAdmin: boolean; grants: PortalGrant[] } | null> {
  const user = await findPortalUserById(db, portalUserId);
  if (!user) return null;

  const grants = await findGrantsByPortalUser(db, portalUserId);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    isAdmin: user.isAdmin,
    grants: grants.map((g) => g.grant as PortalGrant),
  };
}

/**
 * Tenant-wide portal-user list for superadmin 26 §1.
 *
 * Maps the repository row to the wire DTO by explicit field selection — never a
 * spread of the row. `password_hash`, `must_change_password`, `failed_login_
 * attempts` and the soft-delete audit columns all live on that row and none of
 * them belong on a list page.
 *
 * `lockedUntil` is nulled once it lapses: a past timestamp is not "locked", and
 * sending one would have every client re-implement the same comparison.
 */
export async function listPortalUsers(
  db: Db,
  query: ListPortalUsersQuery,
): Promise<GenericQueryResponse<PortalUserListItem>> {
  const result = await listPortalUsersPaged(db, query);
  const now = Date.now();

  return {
    ...result,
    items: result.items.map((row) => ({
      id: row.id,
      name: row.name,
      paternalLastName: row.paternalLastName,
      maternalLastName: row.maternalLastName,
      email: row.email,
      role: row.role,
      status: row.status,
      isAdmin: row.isAdmin,
      customerId: row.customerId,
      customerName: row.customerName,
      grants: row.grants,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      invitedByName: row.invitedByName,
      lockedUntil:
        row.lockedUntil && row.lockedUntil.getTime() > now ? row.lockedUntil.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
