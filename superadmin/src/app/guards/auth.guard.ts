import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { AuthState } from '../../state/auth/auth.state';
import { environment } from '../../environments/environment';

/** Token presence only — no frontend JWT decoding; the backend is the sole
 *  authority on validity (401s land in the interceptor). */
export const authGuard: CanActivateFn = () => {
  if (environment.bypassAuthGuard) return true;
  const store = inject(Store);
  const router = inject(Router);
  const token = store.selectSnapshot(AuthState.token);
  return token ? true : router.parseUrl('/login');
};
