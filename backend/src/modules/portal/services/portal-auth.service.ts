import type { Env } from '../../../env';
import type { Db } from '../../database/client';
import {
  findPortalUserByEmail,
  findPortalUserByEmailForLogin,
  findPortalUserById,
  isPortalUserLocked,
  incrementFailedLoginAttempts,
  clearPortalUserLockout,
  updatePortalUserPassword,
} from '../repository/portal-users.repository';
import {
  createPasswordReset,
  findPasswordResetByTokenHash,
  consumePasswordReset,
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
import { PortalAccountSuspendedError } from '../http-errors/portal-account-suspended.error';
import { findCustomerById } from '../../customers/repository/customers.repository';
import { generateResetToken, hashResetToken } from '../utils/reset-token';
import { sendEmail } from '../../email/services/email.service';
import {
  renderPasswordResetEmailHTML,
  renderPasswordResetEmailText,
  renderPasswordResetEmailSubject,
} from '../helpers/portal-password-reset-email.helpers';
import { getBrand } from '../../brand/services/brand.service';
import type { PortalLoginResult } from '../types/portal-auth.types';

/**
 * Portal login with A3 lockout (5 fails → 2h cooldown). The lockout is checked
 * before password verification so a locked account answers the same as an
 * invalid password — no oracle.
 *
 * Returns null when credentials don't match or the account is locked; throws
 * `PortalAccountSuspendedError` when staff suspended or revoked it.
 */
export const portalLogin = async (
  db: Db,
  { email, password }: PortalLoginInput,
  secret: string,
): Promise<PortalLoginResult | null> => {
  const user = await findPortalUserByEmailForLogin(db, email);
  if (!user) return null;

  // Suspended and revoked (soft-deleted) accounts both say so (owner
  // 2026-09-05) — staff turned this access off, and the customer is told.
  if (user.status === PortalUserStatus.Suspended || user.deletedAt !== null) {
    throw new PortalAccountSuspendedError();
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
  defer?: (work: Promise<unknown>) => void,
): Promise<void> => {
  const { email } = _input;

  // Silently do nothing for unknown addresses — no enumeration.
  const user = await findPortalUserByEmail(db, email);
  if (!user) return;

  // A suspended account gets no reset mail. `findPortalUserByEmail` filters only
  // `deleted_at`, so without this a suspended user could mail themselves a token
  // and walk back in through an unauthenticated route. Same silent 204 — saying
  // "suspended" here would confirm the address exists.
  if (user.status === PortalUserStatus.Suspended) return;

  // Generate token, hash it, store it.
  const plainToken = generateResetToken();
  const tokenHash = await hashResetToken(plainToken);

  // Create the new reset record.
  const reset = await createPasswordReset(db, user.id, tokenHash);
  if (!reset) return; // Unlikely, but gracefully skip email if insert fails.

  // Prune old unused tokens (keep max 3 live; newest wins).
  await pruneOldResets(db, user.id);

  // Fetch the brand for the email.
  const brand = await getBrand(db, env.LOGOS_CDN_BASE_URL);

  // Build the reset URL: the portal app's /reset-password page (03 §4).
  const resetUrl = `${env.PORTAL_BASE_URL}/reset-password?token=${encodeURIComponent(plainToken)}`;

  // Send the email. Deferred off the request path when the caller supplies a
  // `defer` (the Worker's executionCtx.waitUntil): an awaited Resend round trip
  // makes the known-address path hundreds of milliseconds slower than the
  // unknown one, which is an enumeration oracle the identical 204 body does not
  // close. Tests pass no `defer`, so the send stays awaited and assertable.
  const send = async () => {
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
          colors: brand.colors,
        }),
        text: renderPasswordResetEmailText({
          resetUrl,
          brandName: brand.name,
        }),
      });
    } catch {
      // Email send failed — the reset row exists but was never mailed. The user
      // can try again; we never re-throw, so the response stays 204 either way.
    }
  };

  if (defer) defer(send());
  else await send();
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
): Promise<boolean> => {
  // Hash the provided token and look it up.
  const tokenHash = await hashResetToken(token);
  const reset = await findPasswordResetByTokenHash(db, tokenHash);

  if (!reset) return false; // Invalid, expired, or already used.

  // Hash outside the transaction — argon/bcrypt work is slow and holding a row
  // lock across it would serialise unrelated resets.
  const passwordHash = await hashPassword(password);

  return db.transaction(async (tx) => {
    // Consume FIRST. The conditional update is the concurrency guard: of two
    // requests carrying the same token, exactly one gets a row, and the loser
    // leaves the password untouched. Doing this after the password write would
    // let both succeed, and an isolate death between the two statements would
    // leave a live token against an already-changed password.
    const consumed = await consumePasswordReset(tx, reset.id);
    if (!consumed) return false;

    // Refuses a suspended or soft-deleted account (see the repository).
    const updated = await updatePortalUserPassword(tx, reset.portalUserId, passwordHash);
    if (!updated) {
      // Roll the consumption back with the write — a token burned against an
      // account that could not accept it would strand the user.
      tx.rollback();
      return false;
    }

    return true;
  });
};
