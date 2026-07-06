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
}

export interface CmsHome {
  title: string; // hero heading (the service-target rotator completes it)
  description: string; // hero lede
  service_targets: string[]; // hero rotator words
  badges: CmsHomeBadge[]; // hero metrics strip
  services_content: {
    eyebrow?: string;
    title: string;
    description: string;
  };
  services: CmsHomeService[];
  service_area?: string; // one-liner used in the footer blurb
  contact_cta?: {
    title: string;
    description: string;
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
