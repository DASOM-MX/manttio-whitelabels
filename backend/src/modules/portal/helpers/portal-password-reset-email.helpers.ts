import { portalPasswordResetEmailHtml } from '../templates/portal-password-reset-email.html.ts';

export interface PortalPasswordResetEmailParams {
  resetUrl: string;
  brandName?: string;
}

/**
 * Render the HTML body of a password reset email.
 */
export function renderPasswordResetEmailHTML(params: PortalPasswordResetEmailParams): string {
  return portalPasswordResetEmailHtml(params.resetUrl, params.brandName);
}

/**
 * Render the plain-text version of a password reset email.
 */
export function renderPasswordResetEmailText(params: PortalPasswordResetEmailParams): string {
  const brandName = params.brandName || 'Portal';
  return `Reset Your Password

Hello,

We received a request to reset the password for your account. Click the link below to set a new password:

${params.resetUrl}

This link expires in 1 hour. If you did not request a password reset, you can ignore this email. Your account remains secure.

If you have any questions, please contact our support team.

---
This is an automated message from ${brandName}. Please do not reply to this email.
`;
}

/**
 * Render the email subject.
 */
export function renderPasswordResetEmailSubject(brandName?: string): string {
  return `Password Reset Request${brandName ? ` - ${brandName}` : ''}`;
}
