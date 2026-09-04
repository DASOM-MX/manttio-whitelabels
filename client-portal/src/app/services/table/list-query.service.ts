import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, type ParamMap, type Params } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import type { TableLazyLoadEvent } from 'primeng/table';
import type { FilterControl } from '../../data/types/table/filter-control.type';
import type { ListQueryConfig } from '../../data/types/table/list-query-config.type';

const SEARCH_DEBOUNCE_MS = 300;

/** Whitelist a URL param against a label/constant map — anything not a key
 *  collapses to '' (the "all" option) instead of reaching state or the API. */
export const keyIn = <K extends string>(
  map: Record<K, unknown>,
  value: string | null,
): K | '' => (value && value in map ? (value as K) : '');

/** URL-persisted list filters + pagination — ported from superadmin's
 *  `ListQueryService` (04 §1: filters + page live in the URL,
 *  `queryParamMap` is the single load path). Provide per component
 *  (`providers: [ListQueryService]`) — it scopes to that page's route and
 *  dies with it. */
@Injectable()
export class ListQueryService {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  /** Rows per page — one shared value: only one list is ever on screen at a
   *  time, so pages read `list.PAGE_SIZE` rather than each carrying its own. */
  readonly PAGE_SIZE = 10;

  /** Paginator offset for `[first]`, kept in sync with the URL page. */
  readonly first = signal(0);

  /** Row indices for the `#loadingbody` skeletons — one per row the page will
   *  actually hold, so the table is the same height loading as loaded and
   *  doesn't resize when the rows land. */
  readonly skeletonRows = Array.from({ length: this.PAGE_SIZE }, (_, i) => i);

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
        this.first.set((page - 1) * this.PAGE_SIZE);
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
    const rows = event.rows ?? this.PAGE_SIZE;
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
