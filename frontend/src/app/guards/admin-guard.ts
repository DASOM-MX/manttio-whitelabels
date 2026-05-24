import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { AuthState } from '../../state/auth/auth.state';

export const adminGuard: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);
  const role = store.selectSnapshot(AuthState.role);
  return role === 'admin' ? true : router.parseUrl('/home');
};
