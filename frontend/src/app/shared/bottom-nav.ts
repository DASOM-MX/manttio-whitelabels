import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { Store } from '@ngxs/store';
import { filter } from 'rxjs/operators';
import { AuthState } from '../store/auth/auth';
import { Logout } from '../store/auth/actions/logout';

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

  user = this.store.selectSignal(AuthState.user);
  isAdmin = this.store.selectSignal(AuthState.isAdmin);
  showMenu = signal(false);

  constructor() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.showMenu.set(false));
  }

  toggleMenu() {
    this.showMenu.update((open) => !open);
  }

  logout() {
    this.store.dispatch(new Logout()).subscribe(() => {
      this.router.navigate(['/login']);
    });
  }
}
