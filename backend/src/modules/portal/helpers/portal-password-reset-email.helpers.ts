import { portalPasswordResetEmailHtml } from '../templates/portal-password-reset-email.html.ts';
import type { BrandColors } from '../../brand/dtos/brand.dto';
import { hslToHex } from '../../brand/utils/hsl-color';

export interface PortalPasswordResetEmailParams {
  resetUrl: string;
  brandName?: string;
  /** Tenant brand colours. Optional so a tenant with no palette still mails. */
  colors?: BrandColors;
}

// Same derivation the quotation and report emails use: primary-800 reads as
// "the brand" at button size, and the neutral fallback keeps an unbranded
// tenant legible rather than transparent.
const CTA_FALLBACK = '#1f2937';

const ctaColor = (colors?: BrandColors): string =>
  (colors ? hslToHex(colors.primary?.['800'] ?? '') : null) ?? CTA_FALLBACK;

/**
 * Render the HTML body of a password reset email.
 */
export function renderPasswordResetEmailHTML(params: PortalPasswordResetEmailParams): string {
  return portalPasswordResetEmailHtml(params.resetUrl, params.brandName, ctaColor(params.colors));
}

/**
 * Render the plain-text version of a password reset email.
 */
export function renderPasswordResetEmailText(params: PortalPasswordResetEmailParams): string {
  const brandName = params.brandName || 'el portal';
  return `Restablece tu contraseña

Hola,

Recibimos una solicitud para restablecer la contraseña de tu cuenta. Abre este enlace para elegir una nueva:

${params.resetUrl}

Este enlace vence en 1 hora. Si no solicitaste el cambio, puedes ignorar este correo: tu cuenta sigue protegida.

---
Mensaje automático de ${brandName}.
`;
}

/**
 * Render the email subject.
 */
export function renderPasswordResetEmailSubject(brandName?: string): string {
  return `Restablece tu contraseña${brandName ? ` · ${brandName}` : ''}`;
}
