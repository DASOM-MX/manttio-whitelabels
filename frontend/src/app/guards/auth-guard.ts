import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { jwtDecode } from 'jwt-decode';
import { AuthState } from '../../state/auth/auth.state';
import { Logout } from '../../state/auth/auth.actions';
import type { JwtPayload } from '../data/dtos/jwt';

export const authGuard: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);
  const token = store.selectSnapshot(AuthState.token);
  if (!token) return router.parseUrl('/login');
  try {
    const { exp } = jwtDecode<JwtPayload>(token);
    if (exp < Math.floor(Date.now() / 1000)) {
      store.dispatch(new Logout());
      return router.parseUrl('/login');
    }
    return true;
  } catch {
    store.dispatch(new Logout());
    return router.parseUrl('/login');
  }
};
