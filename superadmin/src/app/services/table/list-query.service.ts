import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, type ParamMap, type Params } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, type Observable } from 'rxjs';
import type { TableLazyLoadEvent } from 'primeng/table';

const SEARCH_DEBOUNCE_MS = 300;

/** Whitelist a URL param against a label/constant map — anything not a key
 *  collapses to '' (the "all" option) instead of reaching state or the API. */
export const keyIn = <K extends string>(
  map: Record<K, unknown>,
  value: string | null,
): K | '' => (value && value in map ? (value as K) : '');

/** The slice of AbstractControl the filter bindings need. */
interface FilterControl {
  valueChanges: Observable<unknown>;
}

export interface ListQueryConfig {
  pageSize: number;
  /** Sync sanitized URL params into the form controls (`emitEvent: false` —
   *  the URL is already the source of truth here). */
  read: (params: ParamMap) => void;
  /** Serialize current control values into URL params; empty → null so the
   *  param drops off the URL. */
  write: () => Params;
  /** Dispatch the load for the current (sanitized) state. */
  load: (page: number) => void;
}

/** URL-persisted list filters + pagination (05 §3 canon), extracted so list
 *  pages keep only their domain bits: param names/whitelists, query building
 *  and the dispatch. Provide per component (`providers: [ListQueryService]`)
 *  — it scopes to that page's route and dies with it.
 *
 *  Mechanics owned here: the queryParamMap subscription as the single load
 *  path, page clamping, the `[first]` paginator offset, filter→URL
 *  navigation (browser back/forward walks the filter history), lazy-load
 *  page changes, and the refetch/step-back-on-empty refresh. */
@Injectable()
export class ListQueryService {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  /** Paginator offset for `[first]`, kept in sync with the URL page. */
  readonly first = signal(0);

  private config: ListQueryConfig | null = null;
  private currentPage = 1;

  /** Current page (1-based) as read from the URL. */
  get page(): number {
    return this.currentPage;
  }

  init(config: ListQueryConfig): void {
    this.config = config;
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
        this.currentPage = page;
        this.first.set((page - 1) * config.pageSize);
        config.read(params);
        config.load(page);
      });
  }

  /** Filter-control wiring: search debounces, the rest navigate right away. */
  bindFilters(controls: { debounced?: FilterControl[]; instant?: FilterControl[] }): void {
    for (const control of controls.debounced ?? []) {
      control.valueChanges
        .pipe(
          debounceTime(SEARCH_DEBOUNCE_MS),
          distinctUntilChanged(),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => this.apply());
    }
    for (const control of controls.instant ?? []) {
      control.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.apply());
    }
  }

  /** Pushes the filter/page state into the URL; the queryParamMap
   *  subscription picks it up and loads. Page 1 drops off the URL. */
  apply(page = 1): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...(this.config?.write() ?? {}), page: page > 1 ? page : null },
    });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? this.config?.pageSize ?? 1;
    const page = Math.floor((event.first ?? 0) / rows) + 1;
    if (page !== this.currentPage) this.apply(page);
  }

  /** Refetch the current page; steps back one page when it just emptied
   *  (pass the post-mutation item count). */
  refresh(remaining: number): void {
    if (remaining === 0 && this.currentPage > 1) {
      this.apply(this.currentPage - 1);
      return;
    }
    this.config?.load(this.currentPage);
  }
}
