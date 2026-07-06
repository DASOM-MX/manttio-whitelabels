import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Store } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { AuthState } from '../../state/auth/auth.state';
import { Logout } from '../../state/auth/auth.actions';

/** Frontend-parity transport: attach the JWT, let the backend be the sole
 *  authority. 401 → logout + login redirect (except on the login call itself,
 *  which surfaces inline). 403 → standard toast and stay on page — config or
 *  role can change under a live session (14-access-control.md §4). */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(Store);
  const messages = inject(MessageService);
  const token = store.selectSnapshot(AuthState.token);
  const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authed).pipe(
    catchError((err) => {
      if (err?.status === 401 && !req.url.endsWith('/auth/login')) {
        store.dispatch(new Logout());
      } else if (err?.status === 403) {
        messages.add({
          severity: 'warn',
          summary: 'Acceso denegado',
          detail: 'No tienes permiso para realizar esta acción.',
        });
      }
      return throwError(() => err);
    }),
  );
};
