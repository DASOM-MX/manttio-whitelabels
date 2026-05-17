import { Injectable, inject } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { jwtDecode } from 'jwt-decode';
import { AuthState } from '../store/auth/auth';
import { Logout } from '../store/auth/actions/logout';
import { JwtPayload } from '../interfaces/jwt-payload';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  private router = inject(Router);
  private store = inject(Store);

  canActivate(): boolean {
    const token = this.store.selectSnapshot(AuthState.token);
    if (!token) {
      this.router.navigate(['/login']);
      return false;
    }

    try {
      const decoded = jwtDecode<JwtPayload>(token);
      const now = Math.floor(Date.now() / 1000);
      if ((decoded.exp ?? 0) < now) {
        this.store.dispatch(new Logout());
        this.router.navigate(['/login']);
        return false;
      }
      return true;
    } catch {
      this.store.dispatch(new Logout());
      this.router.navigate(['/login']);
      return false;
    }
  }
}
