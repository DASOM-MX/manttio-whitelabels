/** Brand DTOs — mirror of the canonical backend contract in
 *  `backend/src/modules/brand/dtos/brand.dto.ts` (field-app-whitelabeling
 *  00-master → "Shared brand contract"); `website/src/lib/types.ts` and the
 *  field app's `data/dtos/brand/` carry the same shape. Never fork it;
 *  reconcile against the backend when it moves. Color scales are HSL
 *  components ("H S% L%") at steps 0…1000 by 100 — never hex (rule 2). The
 *  editor works in hex internally (pickers) and converts at the boundaries
 *  (`ColorScaleService.toWireScale`/`fromWireScale`). */

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
    surface?: BrandColorScale;
  };
  contact?: BrandContact;
  social?: BrandSocial;
  font?: BrandFont;
}

/** `PUT /brand` — owner-only, direct-apply (03 §8). Images travel as R2 keys
 *  (from `POST /upload/logo` — the brand-asset bucket); scales travel
 *  materialized as HSL 0…1000 so consumers never run palette math. */
export interface SaveBrandRequest {
  name: string;
  slogan?: string;
  description?: string;
  siteUrl?: string;
  logoKey?: string;
  logoDarkKey?: string;
  isologoKey?: string;
  faviconKey?: string;
  colors: {
    primary: BrandColorScale;
    surface: BrandColorScale;
  };
  // Contact info is required brand data (the backend rejects it missing);
  // social links stay optional — blank ones are omitted, never sent empty.
  contact: Required<BrandContact>;
  social?: BrandSocial;
  font?: BrandFont;
}

/** `GET /fonts` — public curated catalog (03 §2.1). The website consumes a
 *  subset of these fields; the picker metadata is for this module's editor. */
export interface FontCatalogEntry {
  code: string;
  label: string; // CSS family name
  group?: string; // picker section, e.g. 'Defaults', 'Neutral / institucional'
  roles?: 'body' | 'heading' | 'both';
  files: {
    variable?: string; // woff2 URL (CDN)
  };
  fallbackStack?: string;
  tnumVerified?: boolean;
  recommendedHeading?: string; // catalog code pairing hint
}
