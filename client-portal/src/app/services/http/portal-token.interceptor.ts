import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError } from 'rxjs';
import { Store } from '@ngxs/store';
import { AuthLogout } from '../../../state/auth/auth.actions';
import { AuthState } from '../../../state/auth/auth.state';

/** Attaches the portal auth token to every HTTP request and handles 401 by
 *  clearing auth state and routing to login. The token is read lazily from the
 *  store on each request so a token refresh (or logout) takes effect
 *  immediately. */
export const portalTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(Store);
  const router = inject(Router);

  // Read token from store; guards have verified presence, but tokens can expire
  const token = store.selectSnapshot(AuthState.token);
  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(req).pipe(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    catchError(async (err: any) => {
      if (err.status === 401) {
        // Token expired or revoked, clear auth and redirect to login
        store.dispatch(new AuthLogout());
        await router.navigate(['/login']);
      }
      throw err;
    }),
  );
};
