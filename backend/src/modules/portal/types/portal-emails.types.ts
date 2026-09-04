import type { BrandColors } from '../../brand/dtos/brand.dto';

// Render inputs for the portal's transactional mail. The templates hold markup
// only; the shapes they take live here.

/** Both credential mails — the invite and the admin-issued reset — carry the
 *  same four fields. */
export interface PortalCredentialEmailParams {
  contactName: string;
  brandName: string;
  tempPassword: string;
  portalUrl: string;
}

/** The self-service reset mail, which sends a link rather than a password. */
export interface PortalPasswordResetEmailParams {
  resetUrl: string;
  brandName?: string;
  /** Tenant brand colours. Optional so a tenant with no palette still mails. */
  colors?: BrandColors;
}
