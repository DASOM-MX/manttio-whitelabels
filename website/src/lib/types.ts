// Read contracts for the whitelabeled backend (plan 15 §1).
// The backend modules don't exist yet — these DTOs are the website's proposal
// and get reconciled when `modules/brand/` and `modules/cms/` land.

export interface BrandColorScale {
  [step: string]: string; // '50'…'950' → hex, materialized server-side (03 §3)
}

export interface Brand {
  name: string;
  slogan?: string;
  description?: string; // business blurb — meta description + footer blurb (03 §2)
  logoUrl?: string; // full logo / wordmark (CDN URL)
  logoDarkUrl?: string; // dark-surface variant; falls back to logoUrl
  isologoUrl?: string; // square mark — favicon source, header chip
  colors?: {
    primary?: BrandColorScale;
    surface?: BrandColorScale;
  };
  contact?: {
    phone?: string;
    whatsapp?: string;
    email?: string;
    address?: string;
  };
  social?: {
    facebook?: string;
    instagram?: string;
    tiktok?: string;
    [network: string]: string | undefined;
  };
  font?: {
    body?: string; // catalog code, e.g. 'work_sans'
    heading?: string; // falls back to body
  };
}

export interface FontCatalogEntry {
  code: string;
  label: string; // CSS family name
  files: {
    variable?: string; // woff2 URL (CDN)
  };
  fallbackStack?: string;
}

export interface CmsHomeBadge {
  heading: string;
  value: string;
  description?: string;
}

export interface CmsHomeService {
  title: string;
  description: string;
  tags: string[];
}

/** Section-copy group (04 §6 v1.1). The editor saves these validator-free, so
 *  fields may arrive as empty strings — treat blank as "use the fallback". */
export interface CmsSectionContent {
  eyebrow?: string;
  title: string;
  description: string;
}

export interface CmsHomeManufacturer {
  name: string;
  logoUrl?: string; // materialized from the R2 key on read; '' when no logo
}

export interface CmsHome {
  title: string; // hero heading (the service-target rotator completes it)
  description: string; // hero lede
  hero_video_url?: string; // hero background video; absent → gradient
  service_targets: string[]; // hero rotator words
  badges: CmsHomeBadge[]; // hero metrics strip
  services_content: CmsSectionContent;
  services: CmsHomeService[];
  service_area?: string; // one-liner used in the footer blurb
  contact_cta?: {
    title: string;
    description: string;
  };
  clients_content?: CmsSectionContent & {
    cta_title?: string;
    cta_description?: string;
  };
  manufacturers_content?: CmsSectionContent;
  manufacturers?: CmsHomeManufacturer[]; // logo wall
  location_content?: CmsSectionContent & {
    schedule?: string; // e.g. 'Lun a vie, 8:00 – 18:00'
  };
}

export interface CmsClient {
  name: string;
  legal?: string;
  sector?: string;
  logoUrl: string;
  businessRelationDescription?: string;
}

export interface SiteData {
  brand: Brand;
  home: CmsHome;
  clients: CmsClient[];
  fonts: FontCatalogEntry[];
  /** true when at least one read came from the live backend */
  live: boolean;
}
