import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { Store, select } from '@ngxs/store';
import { filter } from 'rxjs/operators';
import { AppState } from '../../state/app/app.state';
import { AuthState } from '../../state/auth/auth.state';
import { Logout } from '../../state/auth/auth.actions';
import { OfflineReportsState } from '../../state/offline-reports/offline-reports.state';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.scss',
})
export class BottomNav {
  private router = inject(Router);
  private store = inject(Store);

  user = select(AuthState.user);
  role = select(AuthState.role);
  isAdmin = computed(() => this.role() === 'admin');
  showMenu = signal(false);

  /** Connectivity + offline queue size, for the offline bar and the pending badge. */
  isOnline = select(AppState.isOnline);
  pendingCount = select(OfflineReportsState.count);

  constructor() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.showMenu.set(false));
  }

  toggleMenu() {
    this.showMenu.update((open) => !open);
  }

  logout() {
    this.store.dispatch(new Logout());
  }
}
