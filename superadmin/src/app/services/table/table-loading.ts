import { computed, type Signal } from '@angular/core';

/** The two flags a `p-table` needs to render a load without lying about it. */
export interface TableLoadingFlags {
  /** Bind to `[loading]` — drives the `#loadingbody` skeletons. */
  showSkeleton: Signal<boolean>;
  /** Bind to `[class.table-refreshing]` — marks the rows on screen as stale. */
  refreshing: Signal<boolean>;
}

/** Split "a request is in flight" into the two states a table actually has.
 *
 *  PrimeNG renders the body rows and the loading body as **two independent
 *  blocks**: the `ngFor` over `value` is unguarded, and `#loadingbody` follows
 *  it under a bare `*ngIf="dataTable.loading"` — only the empty message carries
 *  a `&& !dataTable.loading` (`primeng-table.mjs`, `TableBody`). So a plain
 *  in-flight boolean bound to `[loading]` does not *replace* the rows on
 *  screen, it **appends skeletons underneath them**: on a page change the table
 *  briefly stands `rows + skeletons` tall, showing the page you just left and a
 *  loading state at the same time.
 *
 *  The two flags separate the cases:
 *  - `showSkeleton` — nothing to show yet (first load, or filters that cleared
 *    the rows). Skeletons stand in for content, which is what they are for.
 *  - `refreshing` — rows are being swapped for other rows. They stay put and
 *    stay lit; the stylesheet only takes them out of hit-testing so no stale
 *    row reads as clickable-and-current, and runs a delayed hairline on the
 *    card's top edge for the loads slow enough to need a cue.
 *
 *  The two are mutually exclusive by construction, so the skeletons never
 *  stack under the rows and a refresh never draws a loading body. */
export const tableLoading = (
  loading: Signal<boolean>,
  rows: Signal<readonly unknown[]>,
): TableLoadingFlags => ({
  showSkeleton: computed(() => loading() && rows().length === 0),
  refreshing: computed(() => loading() && rows().length > 0),
});
