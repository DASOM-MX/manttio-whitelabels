import { Component, computed, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { Store, select } from '@ngxs/store';
import { filter } from 'rxjs/operators';
import { Popover, PopoverModule } from 'primeng/popover';
import { AppState } from '../../state/app/app.state';
import { SetDarkMode } from '../../state/app/app.actions';
import { AuthState } from '../../state/auth/auth.state';
import { Logout } from '../../state/auth/auth.actions';
import { OfflineReportsState } from '../../state/offline-reports/offline-reports.state';
import { PendingVisitActionsState } from '../../state/pending-visit-actions/pending-visit-actions.state';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [RouterModule, PopoverModule],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.scss',
})
export class BottomNav {
  private router = inject(Router);
  private store = inject(Store);

  user = select(AuthState.user);
  role = select(AuthState.role);
  isAdmin = computed(() => this.role() === 'admin');

  /** Connectivity + offline queue size, for the offline bar and the pending badge. */
  isOnline = select(AppState.isOnline);
  pendingCount = select(OfflineReportsState.count);
  /** Un-delivered field taps (Iniciar/Terminar/Cerrar) — badges the Visitas tab
   *  so the technician can see work is still waiting on a connection. */
  pendingVisitCount = select(PendingVisitActionsState.count);

  /** Dark-mode preference (persisted via NGXS storage; mirrored onto `<html>` by `App`). */
  darkMode = select(AppState.darkMode);

  /** PrimeNG Popover for the "Otros" menu. It handles outside-click + ESC
   *  dismiss + viewport-aware positioning out of the box — we only need to
   *  close it programmatically on route changes (clicks inside don't auto-
   *  close, so a routerLink inside would otherwise leave the popover open
   *  on the new page). */
  otrosPopover = viewChild.required<Popover>('otrosPopover');

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.otrosPopover().hide());
  }

  toggleDarkMode() {
    this.store.dispatch(new SetDarkMode(!this.darkMode()));
  }

  logout() {
    this.store.dispatch(new Logout());
  }
}
