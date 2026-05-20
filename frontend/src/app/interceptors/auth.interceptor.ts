import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { catchError, throwError } from 'rxjs';
import { AuthState } from '../../state/auth/auth.state';
import { Logout } from '../../state/auth/auth.actions';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(Store);
  const token = store.selectSnapshot(AuthState.token);
  const authed = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;
  return next(authed).pipe(
    catchError((err) => {
      if (err?.status === 401) store.dispatch(new Logout());
      return throwError(() => err);
    }),
  );
};
