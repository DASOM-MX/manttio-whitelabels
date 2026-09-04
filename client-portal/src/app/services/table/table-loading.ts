import { computed, type Signal } from '@angular/core';
import type { TableLoadingFlags } from '../../data/types/table/table-loading-flags.type';

/** Split "a request is in flight" into the two states a table actually has:
 *  `showSkeleton` when there is nothing to show yet, `refreshing` when rows
 *  are being swapped for other rows (they stay put, dimmed and non-clickable,
 *  rather than stacking skeletons under them). */
export const tableLoading = (
  loading: Signal<boolean>,
  rows: Signal<readonly unknown[]>,
): TableLoadingFlags => ({
  showSkeleton: computed(() => loading() && rows().length === 0),
  refreshing: computed(() => loading() && rows().length > 0),
});
