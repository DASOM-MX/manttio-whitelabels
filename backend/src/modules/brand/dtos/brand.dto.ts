// Shared brand read contract (field-app-whitelabeling 00-master → "Shared brand
// contract"). This is the canonical shape — website/src/lib/types.ts and
// superadmin/src/app/data/dtos/brand.ts mirror it. Color scales are HSL
// components ("H S% L%") at steps 0…1000 by 100 — never hex (rule 2). Images
// are materialized CDN URLs on read; clients never see R2 keys (rule 6).

import type { FontRole } from '../enums/brand.enum';

/** Steps '0'…'1000' by 100 → "H S% L%" components. */
export type HslScale = { [step: string]: string };

export type BrandColors = {
  primary: HslScale;
  surface: HslScale;
};

export type BrandContact = {
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
};

/** Known networks: facebook, instagram, tiktok, googleMaps — open-ended. */
export type BrandSocial = { [network: string]: string };

/** Catalog codes (GET /fonts), e.g. 'work_sans'; heading falls back to body. */
export type BrandFont = {
  body?: string;
  heading?: string;
};

export type Brand = {
  name: string;
  slogan?: string;
  description?: string;
  /** The tenant's public site — email footers link it; hidden when absent. */
  siteUrl?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  isologoUrl?: string;
  /** PWA manifest / favicon source (field-app plan 02). */
  faviconUrl?: string;
  /** Always materialized: the tenant's scales or the neutral default (rule 3). */
  colors: BrandColors;
  contact?: BrandContact;
  social?: BrandSocial;
  font?: BrandFont;
};

export type FontCatalogEntry = {
  code: string;
  label: string;
  /** Picker section in the superadmin editor. */
  group?: string;
  roles?: FontRole;
  files: {
    /** Variable woff2 URL on the shared fonts CDN; absent until configured. */
    variable?: string;
  };
  fallbackStack?: string;
  tnumVerified?: boolean;
  /** Catalog code pairing hint for the editor. */
  recommendedHeading?: string;
};
