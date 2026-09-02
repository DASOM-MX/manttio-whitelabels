import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { Store } from '@ngxs/store';
import { AuthState } from '../../state/auth/auth.state';

/** Guard that checks token presence only — the backend is the sole authority
 *  on token validity. */
export const portalAuthGuard: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);

  const isAuthenticated = store.selectSnapshot(AuthState.isAuthenticated);
  if (isAuthenticated) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
