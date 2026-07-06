import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { AuthState } from '../../state/auth/auth.state';

/** Keeps authenticated users out of /login — the landing guard picks their
 *  role-appropriate start route from there. */
export const guestGuard: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);
  const token = store.selectSnapshot(AuthState.token);
  return token ? router.parseUrl('/') : true;
};
