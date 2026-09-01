import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { Store } from '@ngxs/store';
import { AuthLogout } from '../../../state/auth/auth.actions';
import { AuthState } from '../../../state/auth/auth.state';

/** Attaches the portal token and turns a 401 into a logout. Read from the store
 *  per request so a logout takes effect on the next call, not the next reload. */
export const portalTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(Store);
  const router = inject(Router);

  const token = store.selectSnapshot(AuthState.token);
  const authed = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authed).pipe(
    catchError((err: HttpErrorResponse) => {
      // The backend is the sole authority on validity — a 401 is the only
      // signal that the token is dead.
      if (err.status === 401) {
        store.dispatch(new AuthLogout());
        void router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
