import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';

/** Page-header pattern, ported from superadmin (03 CP-3): every routed page
 *  opens with exactly one of these — the page's single `h1`, an optional
 *  muted description, an optional back link, a `meta` slot for status tags
 *  beside the title, and the default slot for right-aligned actions. */
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
