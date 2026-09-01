/** Brand DTOs — mirror of the canonical backend contract in
 *  `backend/src/modules/brand/dtos/brand.dto.ts` (field-app-whitelabeling
 *  00-master → "Shared brand contract"); `website/src/lib/types.ts` and the
 *  field app's `data/dtos/brand/` carry the same shape. Never fork it;
 *  reconcile against the backend when it moves. Color scales are HSL
 *  components ("H S% L%") at steps 0…1000 by 100 — never hex (rule 2). */

export interface BrandColorScale {
  [step: string]: string; // '0'…'1000' by 100 → "H S% L%" components (rule 2)
}

/** Backend-generated PWA manifest icon set — materialized CDN URLs
 *  (regenerated from the mark on every save; field-app plan 02). */
export interface BrandIcons {
  any192: string;
  any512: string;
  maskable192: string;
  maskable512: string;
}

export interface BrandContact {
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
}

export interface BrandSocial {
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  googleMaps?: string; // Google Business pin / maps listing URL
  [network: string]: string | undefined;
}

export interface BrandFont {
  body?: string; // catalog code, e.g. 'work_sans'
  heading?: string; // falls back to body
}

export interface Brand {
  name: string;
  slogan?: string;
  description?: string; // business blurb — the public site's meta description
  siteUrl?: string; // the tenant's public site (email footers link it)
  logoUrl?: string; // full logo / wordmark (CDN URL)
  logoDarkUrl?: string; // dark-surface variant; falls back to logoUrl
  isologoUrl?: string; // square mark — favicon source, PDF header
  faviconUrl?: string; // PWA manifest / favicon source (field-app plan 02)
  icons?: BrandIcons; // generated from the mark (faviconKey ?? isologoKey)
  colors?: {
    primary?: BrandColorScale;
    accent?: BrandColorScale;
  };
  contact?: BrandContact;
  social?: BrandSocial;
  font?: BrandFont;
}
