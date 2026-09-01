import type { Db } from '../../database/client';
import {
  findPortalUserByEmail,
  findPortalUserById,
  isPortalUserLocked,
  incrementFailedLoginAttempts,
  clearPortalUserLockout,
  updatePortalUserPassword,
} from '../repository/portal-users.repository';
import { signPortalToken } from './portal-jwt.service';
import { hashPassword, verifyPassword } from '../../auth/services/password.service';
import type { PortalLoginInput, PortalChangePasswordInput } from '../validators/portal-auth.validator';
import type { PortalMeResponse } from '../dtos/portal-me.dto';
import type { PortalGrant } from '../enums/portal-grants.enum';
import { PortalUserStatus } from '../enums/portal-users.enum';
import { findCustomerById } from '../../customers/repository/customers.repository';

export type PortalLoginResult = { token: string; mustChangePassword: boolean };

/**
 * Portal login with A3 lockout (5 fails → 2h cooldown). The lockout and status
 * are checked before password verification so a locked/suspended account answers
 * the same as an invalid password — no oracle.
 *
 * Returns null when credentials don't match, are locked, or account is suspended/deleted.
 */
export const portalLogin = async (
  db: Db,
  { email, password }: PortalLoginInput,
  secret: string,
): Promise<PortalLoginResult | null> => {
  const user = await findPortalUserByEmail(db, email);
  if (!user) return null;

  // Reject suspended or deleted accounts before password verification — same
  // answer as wrong password so we don't leak account status.
  if (user.status === PortalUserStatus.Suspended || user.deletedAt !== null) {
    return null;
  }

  // Check lockout before verifying the password so we don't leak whether the
  // account is locked or the password is wrong.
  if (isPortalUserLocked(user.lockedUntil)) {
    return null;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await incrementFailedLoginAttempts(db, user.id);
    return null;
  }

  // Successful login: clear lockout and issue token.
  await clearPortalUserLockout(db, user.id);
  const token = await signPortalToken(secret, user.id, user.customerId);
  return { token, mustChangePassword: user.mustChangePassword };
};

/**
 * Portal session snapshot for GET /portal/auth/me — the boot payload the app gates
 * its nav on. Returns null when the portal user no longer exists.
 */
export const portalGetMe = async (
  db: Db,
  portalUserId: string,
  grants: PortalGrant[],
  customerId: string,
): Promise<PortalMeResponse | null> => {
  const user = await findPortalUserById(db, portalUserId);
  if (!user) return null;

  // Load the user's customer name.
  const customer = await findCustomerById(db, customerId);
  if (!customer) return null;

  return {
    user: {
      id: portalUserId,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
    },
    customer: {
      id: customer.id,
      name: customer.name,
    },
    grants,
    mustChangePassword: user.mustChangePassword,
  };
};

/**
 * Change own password for the forced-change flow. Clears must_change_password
 * and flips status to active. Returns false when the user no longer exists.
 */
export const portalChangeOwnPassword = async (
  db: Db,
  portalUserId: string,
  password: string,
): Promise<boolean> => {
  const passwordHash = await hashPassword(password);
  const row = await updatePortalUserPassword(db, portalUserId, passwordHash);
  return row !== null;
};
