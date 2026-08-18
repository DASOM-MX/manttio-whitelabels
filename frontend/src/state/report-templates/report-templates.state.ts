import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext, Store } from '@ngxs/store';
import { EMPTY, Observable, from, of } from 'rxjs';
import { catchError, concatMap, tap } from 'rxjs/operators';
import { ReportTemplatesService } from '../../http/report-templates.service';
import { TemplatesCacheService } from '../../offline/templates-cache.service';
import { AppState } from '../app/app.state';
import { errorMessage } from '../../app/data/utils';
import type { ReportTemplate } from '../../app/data/types/report-template/report-template.types';
import { LoadTemplatePage, PrefetchActiveTemplates } from './report-templates.actions';

export interface ReportTemplatesStateModel {
  /** All cached templates keyed by id. */
  entities: Record<string, ReportTemplate>;
  /** Sparse by design: index = server row position, holes = not yet paged in.
   *  Drives the virtual scroller's pre-sized options array. */
  ids: (string | undefined)[];
  /** The tenant's real active-template count as last reported by the backend.
   *  Offline this is restored from the cache meta, NOT set to the cached row
   *  count — that is the whole point: a partial cache must stay visibly partial. */
  total: number;
  /** Rows actually in the offline store. Equals `total` only when complete. */
  cachedCount: number;
  /** True only when a prefetch pass genuinely walked every page. Distinct from
   *  `prefetchDone`, which merely means we stopped trying. */
  cacheComplete: boolean;
  loading: boolean;
  fromCache: boolean;
  prefetchDone: boolean;
  lastSyncAt?: string;
  /** Why the last prefetch stopped short, when it did. Display-only. */
  cacheError?: string;
}

@State<ReportTemplatesStateModel>({
  name: 'reportTemplates',
  defaults: {
    entities: {},
    ids: [],
    total: 0,
    cachedCount: 0,
    cacheComplete: false,
    loading: false,
    fromCache: false,
    prefetchDone: false,
  },
})
@Injectable()
export class ReportTemplatesState {
  private readonly api = inject(ReportTemplatesService);
  private readonly cache = inject(TemplatesCacheService);
  private readonly store = inject(Store);

  @Selector()
  static entities(s: ReportTemplatesStateModel): Record<string, ReportTemplate> {
    return s.entities;
  }

  @Selector()
  static ids(s: ReportTemplatesStateModel): (string | undefined)[] {
    return s.ids;
  }

  @Selector()
  static total(s: ReportTemplatesStateModel): number {
    return s.total;
  }

  @Selector()
  static loading(s: ReportTemplatesStateModel): boolean {
    return s.loading;
  }

  @Selector()
  static fromCache(s: ReportTemplatesStateModel): boolean {
    return s.fromCache;
  }

  @Selector()
  static prefetchDone(s: ReportTemplatesStateModel): boolean {
    return s.prefetchDone;
  }

  /** The tenant genuinely has no active templates — a real first-run path (a new tenant
   *  authors its own in superadmin), not an edge case. The picker renders the
   *  "no hay plantillas activas" empty state. */
  @Selector()
  static hasNoActiveTemplates(s: ReportTemplatesStateModel): boolean {
    return !s.loading && s.total === 0 && !s.fromCache;
  }

  /** The cache is empty because this device has never been online. Distinct from the
   *  above: the fix is "conéctate una vez para descargar las plantillas", not "author a
   *  template". Never let these two collapse into one blank screen. */
  @Selector()
  static needsFirstSync(s: ReportTemplatesStateModel): boolean {
    return !s.loading && s.total === 0 && s.fromCache;
  }

  @Selector()
  static cachedCount(s: ReportTemplatesStateModel): number {
    return s.cachedCount;
  }

  @Selector()
  static cacheComplete(s: ReportTemplatesStateModel): boolean {
    return s.cacheComplete;
  }

  @Selector()
  static cacheError(s: ReportTemplatesStateModel): string | undefined {
    return s.cacheError;
  }

  /** Offline with only part of the catalog: the technician is missing templates
   *  they cannot reach until they reconnect. The picker must say so — a partial
   *  list that looks complete is how someone concludes a template was deleted. */
  @Selector()
  static cachePartialOffline(s: ReportTemplatesStateModel): boolean {
    return s.fromCache && s.total > 0 && !s.cacheComplete;
  }

  @Selector()
  static options(s: ReportTemplatesStateModel): ReportTemplate[] {
    return s.ids.map((id) => (id ? s.entities[id] : undefined)).filter(Boolean) as ReportTemplate[];
  }

  /** Restore the picker from the offline store, provenance included.
   *
   *  `total` comes from the cache meta (the backend's real count), never from the
   *  number of rows we happen to hold — otherwise a cache holding 20 of 47
   *  templates silently presents itself as the complete set. */
  private restoreFromCache(ctx: StateContext<ReportTemplatesStateModel>): Observable<unknown> {
    return from(Promise.all([this.cache.list(), this.cache.getMeta()])).pipe(
      tap(([templates, meta]) => {
        const entities: Record<string, ReportTemplate> = {};
        for (const t of templates) entities[t.id] = t;
        ctx.patchState({
          entities,
          ids: templates.map((t) => t.id),
          // No meta means this device never completed a sync; only then is the
          // row count the best truth available.
          total: meta?.serverTotal ?? templates.length,
          cachedCount: templates.length,
          cacheComplete: meta?.complete ?? false,
          cacheError: meta?.lastError,
          fromCache: true,
          prefetchDone: true,
          loading: false,
          lastSyncAt: meta?.lastSyncAt,
        });
      }),
      catchError(() => {
        // Cache read failed — leave the picker empty rather than erroring out.
        ctx.patchState({ loading: false });
        return EMPTY;
      }),
    );
  }

  @Action(LoadTemplatePage)
  loadPage(ctx: StateContext<ReportTemplatesStateModel>, { page, limit }: LoadTemplatePage): Observable<unknown> {
    ctx.patchState({ loading: true });

    const isOnline = this.store.selectSnapshot(AppState.isOnline);

    if (!isOnline) {
      // Offline: serve the whole cached set and let the scroller page locally.
      return this.restoreFromCache(ctx);
    }

    // Online: fetch the page and cache it
    return this.api.list({ status: 'active', page, limit }).pipe(
      tap((response) => {
        const { items, total } = response;
        const state = ctx.getState();
        const startIndex = (page - 1) * limit;
        const newIds = [...state.ids];
        const newEntities = { ...state.entities };

        // Size the sparse array once on first page, then fill slices in place
        if (startIndex === 0) {
          newIds.length = total;
        }

        // Splice the loaded page into the sparse array
        items.forEach((template, i) => {
          newIds[startIndex + i] = template.id;
          newEntities[template.id] = template;
        });

        ctx.patchState({
          entities: newEntities,
          ids: newIds,
          total,
          fromCache: false,
          loading: false,
          lastSyncAt: new Date().toISOString(),
        });
      }),
      // Persist the rows, then the provenance. Both are best-effort: a failed
      // cache write must not fail a page the picker already rendered.
      concatMap((response) =>
        from(
          this.cache
            .putAll(response.items)
            .then(() =>
              this.cache.setMeta({
                serverTotal: response.total,
                lastSyncAt: new Date().toISOString(),
              }),
            ),
        ).pipe(
          tap((meta) =>
            ctx.patchState({ cachedCount: meta.cachedCount, cacheComplete: meta.complete }),
          ),
          catchError(() => of(undefined)),
        ),
      ),
      // Network error: fall back to the cache, provenance and all.
      catchError(() => this.restoreFromCache(ctx)),
    );
  }

  @Action(PrefetchActiveTemplates)
  prefetch(ctx: StateContext<ReportTemplatesStateModel>): Observable<unknown> {
    const isOnline = this.store.selectSnapshot(AppState.isOnline);
    if (!isOnline) return EMPTY;

    const limit = 20;
    let loaded = 0;
    let serverTotal = 0;

    const prefetchPage = (p: number): Observable<unknown> =>
      this.api.list({ status: 'active', page: p, limit }).pipe(
        concatMap((response) => {
          loaded += response.items.length;
          serverTotal = response.total;
          return from(this.cache.putAll(response.items)).pipe(
            concatMap(() =>
              // An empty page ends the walk as surely as reaching the total does:
              // without that guard, a `total` we can never reach (rows deleted
              // mid-walk) recurses forever.
              loaded >= response.total || response.items.length === 0
                ? of(undefined)
                : prefetchPage(p + 1),
            ),
          );
        }),
      );

    const recordMeta = (lastError?: string): Observable<unknown> =>
      from(
        this.cache.setMeta({
          serverTotal,
          lastSyncAt: new Date().toISOString(),
          ...(lastError ? { lastError } : {}),
        }),
      ).pipe(
        tap((meta) =>
          ctx.patchState({
            prefetchDone: true,
            cachedCount: meta.cachedCount,
            cacheComplete: meta.complete,
            cacheError: meta.lastError,
          }),
        ),
        catchError(() => {
          ctx.patchState({ prefetchDone: true });
          return EMPTY;
        }),
      );

    return prefetchPage(1).pipe(
      concatMap(() => recordMeta()),
      catchError((err) => {
        // A failed prefetch must never break a picker that already works off
        // page 1 — it only downgrades what we may claim about the cache.
        if (serverTotal === 0) {
          // The very first page failed, so we learned nothing about the tenant.
          // Leave any earlier provenance alone rather than overwriting it with a
          // zero total, which `setMeta` would read as "complete".
          ctx.patchState({ prefetchDone: true });
          return EMPTY;
        }
        return recordMeta(errorMessage(err, 'La descarga de plantillas quedó incompleta.'));
      }),
    );
  }
}
