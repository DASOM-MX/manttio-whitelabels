import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { AuthState } from '../../state/auth/auth.state';

export const authGuard: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);
  const token = store.selectSnapshot(AuthState.token);
  return token ? true : router.parseUrl('/login');
};
