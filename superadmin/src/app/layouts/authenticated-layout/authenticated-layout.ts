import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { PopoverModule } from 'primeng/popover';
import {
  LucideChevronDown,
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
import { AuthState, MeStatus } from '../../../state/auth/auth.state';
import { LoadMe, Logout } from '../../../state/auth/auth.actions';
import { ForcePasswordDialog } from '../../auth/components/force-password-dialog/force-password-dialog';
import { NotificationCenter } from '../../shared/components/notification-center/notification-center';
import { Sidebar } from '../components/sidebar/sidebar';

@Component({
  selector: 'app-authenticated-layout',
  imports: [
    RouterModule,
    PopoverModule,
    LucideMenu,
    LucideSun,
    LucideMoon,
    LucideLogOut,
    LucideChevronDown,
    LucideUserRound,
    LucideRefreshCw,
    ForcePasswordDialog,
    NotificationCenter,
    Sidebar,
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

  protected drawerOpen = signal(false);
  /** Desktop sidebar rail state — the Sidebar component dispatches the
   *  toggle; the aside width binding reads it here. */
  protected sidebarCollapsed = select(AppState.sidebarCollapsed);

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
        this.scrollContainer()?.nativeElement.scrollTo({ top: 0 });
        this.drawerOpen.set(false);
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

  private replayPageEnter(): void {
    const el = this.pageContainer()?.nativeElement;
    if (!el) return;
    el.classList.remove('anim-page-enter');
    // Force a reflow so removing + re-adding the class restarts the animation.
    void el.offsetWidth;
    el.classList.add('anim-page-enter');
  }
}
