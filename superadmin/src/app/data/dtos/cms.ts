/** CMS DTOs (04-cms.md) — the content shapes mirror the website's proposal in
 *  `website/src/lib/types.ts` (PR #44): the CMS is headless and the public
 *  site is just one consumer. Editors work on the DRAFT copy; the public read
 *  surface serves published-only (04 §5). */

export interface CmsHomeBadge {
  label: string;
  value: string;
  unit?: string;
}

export interface CmsHomeService {
  title: string;
  description: string;
  tags: string[];
  icon?: string; // curated lucide code (model/constants/cms/service-icons.const)
}

/** Section-copy group shared by the per-section content blocks (04 §6). */
export interface CmsHomeSectionContent {
  eyebrow?: string;
  title: string;
  description: string;
}

/** Manufacturers logo-wall entry (04 §6) — name + logo only. `logoUrl` is
 *  materialized by the backend on read (editor echoes it back harmlessly). */
export interface CmsHomeManufacturer {
  name: string;
  logoKey?: string;
  logoUrl?: string;
}

export interface CmsHome {
  title: string; // hero heading (the service-target rotator completes it)
  description: string; // hero lede
  hero_video_url?: string; // hero background video; empty → gradient fallback
  service_targets: string[]; // hero rotator words
  badges: CmsHomeBadge[]; // hero metrics strip
  services_content: CmsHomeSectionContent;
  services: CmsHomeService[];
  service_area?: string; // one-liner used in the footer blurb
  contact_cta?: {
    title: string;
    description: string;
  };
  // ── v1.1 groups (04 §6) — all optional so published v1 docs stay valid ──
  clients_content?: CmsHomeSectionContent & {
    cta_title?: string; // in-section CTA box heading
    cta_description?: string;
  };
  manufacturers_content?: CmsHomeSectionContent;
  manufacturers?: CmsHomeManufacturer[];
  location_content?: CmsHomeSectionContent & {
    schedule?: string; // e.g. "Lun a vie, 8:00 – 18:00" — shown under the phone item
  };
}

/** Draft client entry as the editor sees it. The public read omits `id` and
 *  serves `logoUrl` only (website's `CmsClient`). */
export interface CmsClient {
  id: string;
  name: string;
  legal?: string;
  sector?: string;
  logoKey?: string;
  logoUrl?: string;
  businessRelationDescription?: string; // sanitized HTML (backend authoritative)
}

export interface SaveCmsClientRequest {
  name: string;
  legal?: string;
  sector?: string;
  logoKey?: string;
  businessRelationDescription?: string;
}

/** Editor read envelope: the draft document + whether it differs from the
 *  last-published copy (drives the "cambios sin publicar" badge — 04 §3). */
export interface CmsDocument<T> {
  data: T;
  unpublishedChanges: boolean;
}

export type CmsSection = 'home' | 'clients';
