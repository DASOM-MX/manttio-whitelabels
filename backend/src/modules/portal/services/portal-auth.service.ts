import type { Env } from '../../../env';
import type { Db } from '../../database/client';
import {
  findPortalUserByEmail,
  findPortalUserById,
  isPortalUserLocked,
  incrementFailedLoginAttempts,
  clearPortalUserLockout,
  updatePortalUserPassword,
} from '../repository/portal-users.repository';
import {
  createPasswordReset,
  findPasswordResetByTokenHash,
  markPasswordResetAsUsed,
  pruneOldResets,
} from '../repository/portal-password-resets.repository';
import { signPortalToken } from './portal-jwt.service';
import { hashPassword, verifyPassword } from '../../auth/services/password.service';
import type {
  PortalLoginInput,
  PortalChangePasswordInput,
  PortalForgotPasswordInput,
  PortalResetPasswordInput,
} from '../validators/portal-auth.validator';
import type { PortalMeResponse } from '../dtos/portal-me.dto';
import type { PortalGrant } from '../enums/portal-grants.enum';
import { PortalUserStatus } from '../enums/portal-users.enum';
import { findCustomerById } from '../../customers/repository/customers.repository';
import { generateResetToken, hashResetToken } from '../utils/reset-token';
import { sendEmail } from '../../email/services/email.service';
import {
  renderPasswordResetEmailHTML,
  renderPasswordResetEmailText,
  renderPasswordResetEmailSubject,
} from '../helpers/portal-password-reset-email.helpers';
import { getBrand } from '../../brand/services/brand.service';

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

/**
 * Initiate a password reset: send an email with a reset link.
 * Always returns 204 (no enumeration attack), unknown addresses included.
 * On a match: generates a token, hashes it, stores it (1h TTL), sends email.
 * No return value — fire and forget for anonymity.
 */
export const portalForgotPassword = async (
  db: Db,
  env: Env,
  _input: PortalForgotPasswordInput,
): Promise<void> => {
  const { email } = _input;

  // Silently do nothing for unknown addresses — no enumeration.
  const user = await findPortalUserByEmail(db, email);
  if (!user) return;

  // Generate token, hash it, store it.
  const plainToken = generateResetToken();
  const tokenHash = await hashResetToken(plainToken);

  // Prune old unused tokens (keep max 3).
  await pruneOldResets(db, user.id);

  // Create the new reset record.
  const reset = await createPasswordReset(db, user.id, tokenHash);
  if (!reset) return; // Unlikely, but gracefully skip email if insert fails.

  // Fetch the brand for the email.
  const brand = await getBrand(db, env.LOGOS_CDN_BASE_URL);

  // Build the reset URL.
  const resetUrl = `${env.API_BASE_URL}/portal/auth/reset-password?token=${encodeURIComponent(plainToken)}`;

  // Send the email.
  try {
    await sendEmail({
      apiKey: env.RESEND_API_KEY,
      from: brand.name ? `"${brand.name.replace(/"/g, "'")}" <${env.RESEND_FROM}>` : env.RESEND_FROM,
      to: user.email,
      replyTo: brand.contact?.email,
      subject: renderPasswordResetEmailSubject(brand.name),
      html: renderPasswordResetEmailHTML({
        resetUrl,
        brandName: brand.name,
      }),
      text: renderPasswordResetEmailText({
        resetUrl,
        brandName: brand.name,
      }),
    });
  } catch {
    // Email send failed — the reset row exists but was never mailed.
    // This is acceptable: the user can try again, or contact support.
    // We do not re-throw so the response is still 204.
  }
};

/**
 * Complete a password reset: validate token, set password, mark used.
 * Returns null if token is invalid, expired, or already used.
 * Returns true on success.
 */
export const portalResetPassword = async (
  db: Db,
  token: string,
  password: string,
): Promise<boolean | null> => {
  // Hash the provided token and look it up.
  const tokenHash = await hashResetToken(token);
  const reset = await findPasswordResetByTokenHash(db, tokenHash);

  if (!reset) return null; // Invalid, expired, or already used.

  // Hash the new password.
  const passwordHash = await hashPassword(password);

  // Update the portal user: set password, clear must_change_password, flip to active.
  const updated = await updatePortalUserPassword(db, reset.portalUserId, passwordHash);
  if (!updated) return null;

  // Mark the reset as used (consumed).
  await markPasswordResetAsUsed(db, reset.id);

  return true;
};
