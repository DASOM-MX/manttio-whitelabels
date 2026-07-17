import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { filter, map, take } from 'rxjs';
import { AuthState, MeStatus } from '../../state/auth/auth.state';
import { defaultRouteFor } from './default-route.guard';

/** Resolves the empty path to the role-appropriate landing route (02 §4):
 *  owner/admin/office → /dashboard, technician → /calendar (or /reports when
 *  the tenant has no scheduling). Waits for `/auth/me` like the access guard. */
export const landingGuard: CanActivateFn = () => {
  const store = inject(Store);
  const router = inject(Router);
  // No session → no /auth/me in flight; go straight to /login rather than
  // waiting on a status that will never resolve.
  if (!store.selectSnapshot(AuthState.token)) return router.parseUrl('/login');
  return store.select(AuthState.meStatus).pipe(
    filter((s) => s === MeStatus.Loaded || s === MeStatus.Error),
    take(1),
    map(() => router.parseUrl(defaultRouteFor(store.selectSnapshot(AuthState.me)))),
  );
};
