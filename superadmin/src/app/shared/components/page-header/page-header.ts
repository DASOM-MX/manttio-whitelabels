import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';

/** Page-header pattern (plan 17 §Direction 5, CP-2): every routed page opens
 *  with exactly one of these — the page's single `h1`, an optional muted
 *  one-line description, an optional back link (detail/form pages), a `meta`
 *  slot for status tags beside the title, and the default slot for actions
 *  aligned right (the filters-popover trigger stays left of the primary
 *  action). Title-only by default — no breadcrumbs (the two-level nav
 *  already locates you; owner may opt in later). */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, LucideArrowLeft],
  templateUrl: './page-header.html',
})
export class PageHeader {
  title = input.required<string>();
  description = input<string>();
  backLink = input<string>();
  backLabel = input('Volver');
}
