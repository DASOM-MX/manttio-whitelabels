import { inject, Injectable } from '@angular/core';
import type { ReportTemplate } from '../app/data/types/report-template/report-template.types';
import { OfflineDb } from './offline.db';
import {
  TEMPLATE_CACHE_META_KEY,
  type CachedReportTemplate,
  type TemplateCacheMeta,
} from './template-cache-meta.model';

/** Persistence layer for cached report templates. Wraps the IndexedDB store;
 *  all methods are Promise-based. Higher layers (NGXS `ReportTemplatesState`)
 *  mirror this for the UI and drive the lazy-load + prefetch flow.
 *
 *  Each row holds the **whole** template doc, `sections` included, which is what
 *  lets the capture form render offline on selection. Alongside it, one meta row
 *  records the cache's provenance so the picker can distinguish a complete cache
 *  from a partial one instead of implying whatever it holds is everything. */
@Injectable({ providedIn: 'root' })
export class TemplatesCacheService {
  private readonly db = inject(OfflineDb);

  /** Persist templates (replaces any with the same id), stamping each with the
   *  time this device stored it. */
  async putAll(templates: ReportTemplate[], now: Date = new Date()): Promise<void> {
    const cachedAt = now.toISOString();
    const rows: CachedReportTemplate[] = templates.map((t) => ({ ...t, cachedAt }));
    await this.db.reportTemplates.bulkPut(rows);
  }

  /** All cached templates. */
  list(): Promise<CachedReportTemplate[]> {
    return this.db.reportTemplates.toArray();
  }

  /** A single cached template by id. */
  get(id: string): Promise<CachedReportTemplate | undefined> {
    return this.db.reportTemplates.get(id);
  }

  count(): Promise<number> {
    return this.db.reportTemplates.count();
  }

  /** Cache provenance, or `undefined` before the first successful sync. */
  getMeta(): Promise<TemplateCacheMeta | undefined> {
    return this.db.templateCacheMeta.get(TEMPLATE_CACHE_META_KEY);
  }

  /** Record provenance after a sync.
   *
   *  `cachedCount` and `complete` are both **derived here**, never passed in:
   *  the count is read from the store and completeness is simply "we hold at
   *  least as many rows as the backend said exist". Letting a caller assert
   *  `complete` is how a cache starts claiming to be whole when it isn't — the
   *  bug this whole record exists to prevent. */
  async setMeta(
    meta: Omit<TemplateCacheMeta, 'key' | 'cachedCount' | 'complete'>,
  ): Promise<TemplateCacheMeta> {
    const cachedCount = await this.count();
    const row: TemplateCacheMeta = {
      ...meta,
      key: TEMPLATE_CACHE_META_KEY,
      cachedCount,
      complete: cachedCount >= meta.serverTotal,
    };
    await this.db.templateCacheMeta.put(row);
    return row;
  }

  /** Drops the templates and their provenance together — a cache with orphaned
   *  meta would report a total it no longer has rows for. */
  async clear(): Promise<void> {
    await this.db.reportTemplates.clear();
    await this.db.templateCacheMeta.clear();
  }
}
