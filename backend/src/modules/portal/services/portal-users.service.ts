import type { Db } from '../../database/client';
import type { AuthUser } from '../../../env';
import type { PortalGrant } from '../enums/portal-grants.enum';
import { PortalUserStatus } from '../enums/portal-users.enum';
import { hashPassword, generatePassword } from '../../auth/services/password.service';
import {
  createPortalUser,
  createPortalUserGrants,
  findPortalUserById,
  findGrantsByPortalUser,
  updatePortalUserStatus,
  setPortalUserTempPassword,
  revokePortalUserGrant,
  softDeletePortalUser,
  findPortalUserByEmail,
} from '../repository/portal-users.repository';
import { findContactById } from '../../customers/repository/customers.repository';
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

  // Step 2: Check if a portal user already exists for this contact
  const existing = await findPortalUserByEmail(db, contact.email);
  if (existing) throw new PortalUserAlreadyExistsError('Portal user already exists for this contact');

  // Step 3: Generate a temporary password
  const tempPassword = generatePassword();
  const passwordHash = await hashPassword(tempPassword);

  // Step 4: Create the portal user in a transaction
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
  const tempPassword = generatePassword();
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
  deleteComment?: string,
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
