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
import { AuthState } from '../../../../state/auth/auth.state';
import { navFor } from '../../../guards/nav-for.guard';

/** The brand nav panel (extracted from the authenticated layout 2026-07-23).
 *  Rendered twice: the desktop aside (which drives `collapsed` from
 *  `AppState.sidebarCollapsed`) and the mobile drawer (always expanded).
 *  Collapsed = icon rail; each row reveals a flyout submenu on hover/focus
 *  (CSS-only — see styles.scss `.nav-flyout*`). */
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
