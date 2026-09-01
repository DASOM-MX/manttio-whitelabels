import type { Db } from '../../database/client';
import type { Env } from '../../../env';
import { getBrand } from '../../brand/services/brand.service';
import { sendEmail } from '../../email/services/email.service';
import { invitePortalUserTemplate, invitePortalUserText } from '../templates/invite-portal-user.html';
import { resetPortalPasswordTemplate, resetPortalPasswordText } from '../templates/reset-portal-password.html';

/**
 * HTML-escape a string to prevent injection in email templates.
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]!);
}

/**
 * Send invite email to a new portal user.
 * Uses tenant brand config, never hardcoded literals.
 */
export async function sendPortalUserInviteEmail(
  db: Db,
  env: Env,
  contactName: string,
  email: string,
  tempPassword: string,
): Promise<void> {
  const brand = await getBrand(db, env.LOGOS_CDN_BASE_URL || '');
  const escapedName = escapeHtml(contactName);
  const escapedBrandName = escapeHtml(brand.name);
  const escapedPassword = escapeHtml(tempPassword);

  const portalUrl = new URL('/acceder', env.PORTAL_BASE_URL).toString();

  const html = invitePortalUserTemplate({
    contactName: escapedName,
    brandName: escapedBrandName,
    tempPassword: escapedPassword,
    portalUrl,
  });

  const text = invitePortalUserText({
    contactName: contactName, // Plain text doesn't need escaping for recipient display
    brandName: brand.name,
    tempPassword: tempPassword,
    portalUrl,
  });

  const subject = `Bienvenido al Portal de Clientes de ${brand.name}`;

  await sendEmail({
    apiKey: env.RESEND_API_KEY,
    from: brand.contact?.email || env.RESEND_FROM,
    to: email,
    subject,
    html,
    text,
    replyTo: brand.contact?.email,
  });
}

/**
 * Send password reset email to a portal user.
 * Uses tenant brand config, never hardcoded literals.
 */
export async function sendPortalPasswordResetEmail(
  db: Db,
  env: Env,
  contactName: string,
  email: string,
  tempPassword: string,
): Promise<void> {
  const brand = await getBrand(db, env.LOGOS_CDN_BASE_URL || '');
  const escapedName = escapeHtml(contactName);
  const escapedBrandName = escapeHtml(brand.name);
  const escapedPassword = escapeHtml(tempPassword);

  const portalUrl = new URL('/acceder', env.PORTAL_BASE_URL).toString();

  const html = resetPortalPasswordTemplate({
    contactName: escapedName,
    brandName: escapedBrandName,
    tempPassword: escapedPassword,
    portalUrl,
  });

  const text = resetPortalPasswordText({
    contactName: contactName,
    brandName: brand.name,
    tempPassword: tempPassword,
    portalUrl,
  });

  const subject = `Restablecimiento de Contraseña - Portal de Clientes ${brand.name}`;

  await sendEmail({
    apiKey: env.RESEND_API_KEY,
    from: brand.contact?.email || env.RESEND_FROM,
    to: email,
    subject,
    html,
    text,
    replyTo: brand.contact?.email,
  });
}
