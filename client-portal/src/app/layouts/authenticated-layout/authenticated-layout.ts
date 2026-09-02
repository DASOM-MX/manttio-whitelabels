import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { PopoverModule } from 'primeng/popover';
import {
  LucideLogOut,
  LucideMenu,
  LucideMoon,
  LucideRefreshCw,
  LucideSun,
  LucideUserRound,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { AppState } from '../../../state/app/app.state';
import { SetDarkMode } from '../../../state/app/app.actions';
import { AuthState } from '../../../state/auth/auth.state';
import { BrandState } from '../../../state/brand/brand.state';
import { AuthLoadMe, AuthLogout } from '../../../state/auth/auth.actions';
import { PortalMeStatus } from '../../model/enums/portal-auth/portal-me-status.enum';
import { Sidebar } from '../components/sidebar/sidebar';

/** The authenticated shell — ported from superadmin's `AuthenticatedLayout`
 *  (03 CP-3, A11: drift between the two is accepted, no shared package).
 *  Two adaptations beyond the nav: no `NotificationCenter` (portal users get
 *  email, not in-app notifications, 00 §3.15) and no global-search stub
 *  (superadmin's is a placeholder for a feature this app has no plan for). */
@Component({
  selector: 'app-authenticated-layout',
  imports: [
    RouterModule,
    PopoverModule,
    LucideMenu,
    LucideSun,
    LucideMoon,
    LucideLogOut,
    LucideUserRound,
    LucideRefreshCw,
    Sidebar,
  ],
  templateUrl: './authenticated-layout.html',
})
export class AuthenticatedLayout {
  private readonly router = inject(Router);
  private readonly store = inject(Store);

  protected readonly user = select(AuthState.user);
  protected readonly meStatus = select(AuthState.meStatus);
  protected readonly darkMode = select(AppState.darkMode);
  private readonly brand = select(BrandState.data);

  /** Tenant logo on the boot splash — the dark variant in dark mode, falling
   *  back to the light one, the same choice the login panel makes (03 §3 A12:
   *  the logo comes from `/brand`). A brandless tenant, or a splash that
   *  paints before `/brand` settles, falls back to the product wordmark
   *  rather than an invented identity (branding rule 5). */
  protected readonly logoUrl = computed(() => {
    const brand = this.brand();
    if (!brand) return undefined;
    return this.darkMode() ? (brand.logoDarkUrl ?? brand.logoUrl) : brand.logoUrl;
  });
  protected readonly logoAlt = computed(() => this.brand()?.name ?? 'Logo');

  /** Boot splash until `/portal/auth/me` resolves, error panel on failure. */
  protected readonly isBooting = computed(
    () => this.meStatus() === PortalMeStatus.Idle || this.meStatus() === PortalMeStatus.Loading,
  );
  protected readonly hasError = computed(() => this.meStatus() === PortalMeStatus.Error);

  protected readonly accountLabel = computed(() => {
    const name = this.user()?.user?.name;
    return name ? `Cuenta — ${name}` : 'Cuenta';
  });
  protected readonly themeLabel = computed(() => (this.darkMode() ? 'Modo claro' : 'Modo oscuro'));

  protected readonly drawerOpen = signal(false);
  /** Desktop sidebar rail state — the Sidebar component dispatches the
   *  toggle; the aside width binding reads it here. */
  protected readonly sidebarCollapsed = select(AppState.sidebarCollapsed);

  /** The actual scrollable element is the layout's <main>, not the window —
   *  reset scroll-to-top on every route change so each page lands at its
   *  header. */
  private readonly scrollContainer = viewChild<ElementRef<HTMLElement>>('scrollContainer');
  /** Route-content wrapper — re-triggers the page-enter animation per
   *  navigation by re-adding the CSS class (animations.scss). */
  private readonly pageContainer = viewChild<ElementRef<HTMLElement>>('pageContainer');
  /** Path of the last navigation, query string stripped — a list page keeps
   *  filters/page in the query params, so paging fires NavigationEnd on the
   *  page you are already standing on. */
  private lastRoutePath = '';

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.drawerOpen.set(false);

        const path = event.urlAfterRedirects.split(/[?#]/)[0];
        if (path === this.lastRoutePath) return;
        this.lastRoutePath = path;

        this.scrollContainer()?.nativeElement.scrollTo({ top: 0 });
        this.replayPageEnter();
      });
  }

  protected toggleDark(): void {
    this.store.dispatch(new SetDarkMode(!this.darkMode()));
  }

  protected logout(): void {
    this.store.dispatch(new AuthLogout());
    void this.router.navigate(['/login']);
  }

  protected retryMe(): void {
    this.store.dispatch(new AuthLoadMe());
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
