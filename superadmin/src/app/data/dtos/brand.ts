/** Brand DTOs (03-branding.md §2) — read shape mirrors the website's proposal
 *  in `website/src/lib/types.ts` (PR #44) so both consumers reconcile against
 *  the same backend `modules/brand/` contract when it lands. */

export interface BrandColorScale {
  [step: string]: string; // '50'…'950' (surface also '0') → hex, materialized
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
  [network: string]: string | undefined;
}

export interface BrandFont {
  body?: string; // catalog code, e.g. 'work_sans'
  heading?: string; // falls back to body
}

export interface Brand {
  name: string;
  slogan?: string;
  logoUrl?: string; // full logo / wordmark (CDN URL)
  logoDarkUrl?: string; // dark-surface variant; falls back to logoUrl
  isologoUrl?: string; // square mark — favicon source, PDF header
  colors?: {
    primary?: BrandColorScale;
    surface?: BrandColorScale;
  };
  contact?: BrandContact;
  social?: BrandSocial;
  font?: BrandFont;
}

/** `PUT /brand` — owner-only, direct-apply (03 §8). Images travel as R2 keys
 *  (from `POST /upload/image`); scales travel materialized so consumers never
 *  run palette math. */
export interface SaveBrandRequest {
  name: string;
  slogan?: string;
  logoKey?: string;
  logoDarkKey?: string;
  isologoKey?: string;
  colors: {
    primary: BrandColorScale;
    surface: BrandColorScale;
  };
  contact?: BrandContact;
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
