import type { ReportTemplate } from '../app/data/types/report-template/report-template.types';

/** A cached template is the API row plus when this device stored it.
 *
 *  `cachedAt` stays out of `ReportTemplate` on purpose: that type mirrors the
 *  backend row, and the backend has no idea when a given phone downloaded it. */
export interface CachedReportTemplate extends ReportTemplate {
  /** ISO timestamp of the `putAll` that wrote this row. */
  cachedAt: string;
}

/** The single key the meta store uses — one row, overwritten each sync. */
export const TEMPLATE_CACHE_META_KEY = 'templates';

/** Provenance for the whole template cache, so an offline picker can be honest
 *  about what it has.
 *
 *  Without this the offline path can only report `templates.length`, which reads
 *  as "this is everything" whether the technician prefetched all 47 templates or
 *  lost signal after scrolling the first 20. `serverTotal` is the last count the
 *  backend reported, so the gap is visible offline rather than silent. */
export interface TemplateCacheMeta {
  key: typeof TEMPLATE_CACHE_META_KEY;
  /** `total` from the last successful list response — what the tenant actually has. */
  serverTotal: number;
  /** Rows in the store when this meta was written. Derived, never asserted. */
  cachedCount: number;
  /** `cachedCount >= serverTotal`. Derived in `setMeta` rather than passed in, so
   *  no caller can claim the cache is whole when it isn't — "we stopped trying"
   *  is not "we have it all". */
  complete: boolean;
  /** ISO timestamp of the last successful sync of any page. */
  lastSyncAt: string;
  /** Why the last prefetch stopped short, when it did. Display-only. */
  lastError?: string;
}
