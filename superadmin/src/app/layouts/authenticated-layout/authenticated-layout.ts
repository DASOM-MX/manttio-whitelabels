import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { PopoverModule } from 'primeng/popover';
import {
  LucideChevronDown,
  LucideDynamicIcon,
  LucideLogOut,
  LucideMenu,
  LucideMoon,
  LucideRefreshCw,
  LucideSun,
  LucideUserRound,
  LucideX,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { AppState } from '../../../state/app/app.state';
import { SetDarkMode } from '../../../state/app/app.actions';
import { AuthState, MeStatus } from '../../../state/auth/auth.state';
import { LoadMe, Logout } from '../../../state/auth/auth.actions';
import { navFor } from '../../access';
import { ForcePasswordDialog } from '../../auth/components/force-password-dialog/force-password-dialog';

@Component({
  selector: 'app-authenticated-layout',
  imports: [
    NgTemplateOutlet,
    RouterModule,
    PopoverModule,
    LucideDynamicIcon,
    LucideMenu,
    LucideX,
    LucideSun,
    LucideMoon,
    LucideLogOut,
    LucideChevronDown,
    LucideUserRound,
    LucideRefreshCw,
    ForcePasswordDialog,
  ],
  templateUrl: './authenticated-layout.html',
})
export class AuthenticatedLayout {
  private router = inject(Router);
  private store = inject(Store);

  protected me = select(AuthState.me);
  protected meStatus = select(AuthState.meStatus);
  protected darkMode = select(AppState.darkMode);

  /** Boot splash until /auth/me resolves, error panel on failure (02 §3). */
  protected isBooting = computed(
    () => this.meStatus() === MeStatus.Idle || this.meStatus() === MeStatus.Loading,
  );
  protected hasError = computed(() => this.meStatus() === MeStatus.Error);

  /** Sidebar entries the current `(tenantConfig, role)` allows (access.ts). */
  private navEntries = computed(() => navFor(this.me()));

  protected drawerOpen = signal(false);
  /** Nav groups (Clientes, CMS) the user has expanded. */
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

  /** The actual scrollable element is the layout's <main>, not the window —
   *  reset scroll-to-top on every navigation so each page lands at its
   *  header (frontend parity). */
  private scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');
  /** Route-content wrapper — re-triggers the page-enter animation per
   *  navigation by re-adding the CSS class (animations.scss). */
  private pageContainer = viewChild<ElementRef<HTMLElement>>('pageContainer');

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.currentUrl.set(this.router.url);
        this.scrollContainer()?.nativeElement.scrollTo({ top: 0 });
        this.drawerOpen.set(false);
        this.autoExpandActiveGroup();
        this.replayPageEnter();
      });
  }

  protected toggleDark(): void {
    this.store.dispatch(new SetDarkMode(!this.darkMode()));
  }

  protected logout(): void {
    this.store.dispatch(new Logout());
  }

  protected retryMe(): void {
    this.store.dispatch(new LoadMe());
  }

  protected toggleGroup(label: string): void {
    this.expanded.update((state) => ({ ...state, [label]: !state[label] }));
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

  private replayPageEnter(): void {
    const el = this.pageContainer()?.nativeElement;
    if (!el) return;
    el.classList.remove('anim-page-enter');
    // Force a reflow so removing + re-adding the class restarts the animation.
    void el.offsetWidth;
    el.classList.add('anim-page-enter');
  }
}
