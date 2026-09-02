import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { Store } from '@ngxs/store';
import { AuthState } from '../../state/auth/auth.state';
import type { PortalGrant } from '../model/enums/portal-auth/portal-grants.enum';

/** Route guard factory — a section the portal user has no grant for redirects
 *  to `/home` rather than 404ing. Reads the `grants` array `/portal/auth/me`
 *  already populated; the backend enforces the grant on every request
 *  regardless (this is UX, not the security boundary). */
export const grantGuard = (grant: PortalGrant): CanActivateFn => {
  return () => {
    const store = inject(Store);
    const router = inject(Router);

    const grants = store.selectSnapshot(AuthState.grants);
    if (grants.includes(grant)) {
      return true;
    }

    return router.createUrlTree(['/home']);
  };
};
