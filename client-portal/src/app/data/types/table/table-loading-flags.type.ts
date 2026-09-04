import type { Signal } from '@angular/core';

/** The two flags a `p-table` needs to render a load without lying about it. */
export interface TableLoadingFlags {
  /** Bind to `[loading]` — drives the `#loadingbody` skeletons. */
  showSkeleton: Signal<boolean>;
  /** Bind to `[class.table-refreshing]` — marks the rows on screen as stale. */
  refreshing: Signal<boolean>;
}
