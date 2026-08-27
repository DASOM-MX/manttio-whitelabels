import { Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import {
  LucideChevronDown,
  LucideChevronLeft,
  LucideChevronRight,
  LucideDynamicIcon,
  LucideX,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { SetSidebarCollapsed } from '../../../../state/app/app.actions';
import { AppState } from '../../../../state/app/app.state';
import { AuthState } from '../../../../state/auth/auth.state';
import { BrandState } from '../../../../state/brand/brand.state';
import { navFor } from '../../../guards/nav-for.guard';

/** The nav panel (extracted from the authenticated layout 2026-07-23; a LIGHT
 *  `surface-0` panel since plan 23 CP-2 — the tenant's hue moved off the
 *  furniture and onto the active row). Rendered twice: the desktop aside
 *  (which drives `collapsed` from `AppState.sidebarCollapsed`) and the mobile
 *  drawer (always expanded). Collapsed = icon rail; each row reveals a flyout
 *  submenu on hover/focus (CSS-only — see styles.scss `.nav-flyout*`). The
 *  footer carries the tenant identity card (§ Open ②). */
@Component({
  selector: 'app-sidebar',
  imports: [
    RouterModule,
    LucideDynamicIcon,
    LucideChevronDown,
    LucideChevronLeft,
    LucideChevronRight,
    LucideX,
  ],
  templateUrl: './sidebar.html',
  // `relative` anchors the floating collapse handle on the panel edge.
  host: { class: 'relative flex min-h-0 flex-1 flex-col' },
})
export class Sidebar {
  private router = inject(Router);
  private store = inject(Store);

  /** Icon-rail mode (desktop aside only — the drawer leaves the default). */
  collapsed = input(false);
  /** Mobile drawer close request (the X button). */
  closed = output<void>();

  private me = select(AuthState.me);
  private brand = select(BrandState.brand);
  private darkMode = select(AppState.darkMode);

  /** The footer's tenant identity card (plan 23 CP-2, § Open ②). It waits for
   *  `/brand` to settle so the panel never flashes the manttio fallback at a
   *  branded tenant, then falls back to it exactly as the login panel does. */
  protected brandLoaded = select(BrandState.loaded);
  protected brandName = computed(() => this.brand()?.name ?? 'manttio');
  /** Dark-surface logo variant on the dark panel, same choice the login
   *  brand panel makes; `logoDarkUrl` falls back to `logoUrl` by contract. */
  protected brandLogoUrl = computed(() => {
    const brand = this.brand();
    if (!brand) return undefined;
    return this.darkMode() ? (brand.logoDarkUrl ?? brand.logoUrl) : brand.logoUrl;
  });
  /** Square mark for the collapsed rail — omitted entirely when the tenant
   *  has no isologo (no placeholder tile). */
  protected brandMarkUrl = computed(() => this.brand()?.isologoUrl);
  /** The rail carries the footer only when it has a mark to put there: an
   *  empty bordered strip at the bottom of an icon rail is worse than none. */
  protected footerVisible = computed(
    () => this.brandLoaded() && (!this.collapsed() || !!this.brandMarkUrl()),
  );

  /** Sidebar entries the current `(module availability, role)` allows (access.ts). */
  private navEntries = computed(() => navFor(this.me()));

  /** Nav groups (Negocio, CRM, CMS) the user has expanded. */
  private expanded = signal<Record<string, boolean>>({});
  /** Current URL as a signal so nav view-models recompute per navigation
     without template method calls (01 Angular: no inline calls in templates). */
  private currentUrl = signal(this.router.url);

  /** Precomputed nav view-model — templates read plain data. */
  protected navView = computed(() => {
    const url = this.currentUrl();
    const expanded = this.expanded();
    return this.navEntries().map((entry) => ({
      ...entry,
      expanded: !!expanded[entry.label],
      groupActive:
        entry.children?.some((c) => url === c.route || url.startsWith(`${c.route}/`)) ?? false,
    }));
  });

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.currentUrl.set(this.router.url);
        this.autoExpandActiveGroup();
      });
  }

  protected toggleGroup(label: string): void {
    this.expanded.update((state) => ({ ...state, [label]: !state[label] }));
  }

  protected toggleCollapse(): void {
    this.store.dispatch(new SetSidebarCollapsed(!this.collapsed()));
  }

  private autoExpandActiveGroup(): void {
    const url = this.router.url;
    for (const entry of this.navEntries()) {
      if (!entry.children) continue;
      if (entry.children.some((c) => url === c.route || url.startsWith(`${c.route}/`))) {
        this.expanded.update((state) => ({ ...state, [entry.label]: true }));
      }
    }
  }
}
