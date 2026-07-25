import { Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { PopoverModule } from 'primeng/popover';
import { LucideFilter } from '@lucide/angular';

/** Chakra-style filter popover (owner 2026-07-22): list-page filters
 *  collapse behind a trigger that sits left of the page's primary action.
 *  URL query params stay the single load path (01 List pages) — the active
 *  count derives from which `params` are present in the URL, and clearing
 *  navigates them away so the page's ListQueryService `read()` re-syncs
 *  its controls. Project the `.field-group`s as content; overlay-bearing
 *  controls inside must NOT use `appendTo="body"` — their overlay has to
 *  live inside the popover DOM or the outside-click dismiss swallows it. */
@Component({
  selector: 'app-filters-popover',
  imports: [PopoverModule, LucideFilter],
  templateUrl: './filters-popover.html',
})
export class FiltersPopover {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  /** URL query-param names owned by the projected filter fields. */
  params = input.required<string[]>();

  private queryMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected activeCount = computed(
    () => this.params().filter((p) => (this.queryMap().get(p) ?? '') !== '').length,
  );

  protected clear(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: Object.fromEntries([...this.params(), 'page'].map((p) => [p, null])),
      queryParamsHandling: 'merge',
    });
  }
}
