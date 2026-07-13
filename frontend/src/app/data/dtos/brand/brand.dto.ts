// Mirror of the canonical brand read contract in backend
// `modules/brand/dtos/brand.dto.ts` (field-app-whitelabeling 00-master →
// "Shared brand contract") — never fork this shape; reconcile against the
// backend when it moves. Color scales are HSL components ("H S% L%") at steps
// 0…1000 by 100, never hex (rule 2). Images arrive as materialized CDN URLs;
// absent identity fields render nothing (rule 5).

/** Steps '0'…'1000' by 100 → "H S% L%" components. */
export interface HslScale {
  [step: string]: string;
}

export interface BrandColors {
  primary: HslScale;
  surface: HslScale;
}

export interface BrandContact {
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
}

/** Known networks: facebook, instagram, tiktok, googleMaps — open-ended. */
export interface BrandSocial {
  [network: string]: string;
}

/** Catalog codes (GET /fonts), e.g. 'work_sans'; heading falls back to body. */
export interface BrandFont {
  body?: string;
  heading?: string;
}

export interface Brand {
  name: string;
  slogan?: string;
  description?: string;
  /** The tenant's public site — hidden when absent. */
  siteUrl?: string;
  logoUrl?: string;
  /** Dark-surface variant; falls back to logoUrl. */
  logoDarkUrl?: string;
  /** Square mark — favicon fallback source. */
  isologoUrl?: string;
  /** PWA manifest / favicon source. */
  faviconUrl?: string;
  /** Always materialized: the tenant's scales or the neutral default (rule 3). */
  colors: BrandColors;
  contact?: BrandContact;
  social?: BrandSocial;
  font?: BrandFont;
}
