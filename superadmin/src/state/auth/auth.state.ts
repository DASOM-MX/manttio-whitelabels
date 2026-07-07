import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { Router } from '@angular/router';
import { catchError, switchMap, tap, throwError } from 'rxjs';
import { AuthService } from '../../app/services/http/auth.service';
import { ChangePassword, LoadMe, Login, Logout } from './auth.actions';
import type { MeResponse, Role, TenantConfig } from '../../app/data/dtos/auth';

/** `me` deliberately does NOT persist (only `auth.token` rides the storage
 *  plugin): gating data is refetched on every boot so no gated UI renders
 *  from stale data (14-access-control.md §3). */
export type MeStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface AuthStateModel {
  token: string | null;
  me: MeResponse | null;
  meStatus: MeStatus;
}

const DEFAULTS: AuthStateModel = { token: null, me: null, meStatus: 'idle' };

@State<AuthStateModel>({
  name: 'auth',
  defaults: DEFAULTS,
})
@Injectable()
export class AuthState {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @Selector() static token(s: AuthStateModel): string | null {
    return s.token;
  }
  @Selector() static isAuthenticated(s: AuthStateModel): boolean {
    return !!s.token;
  }
  @Selector() static me(s: AuthStateModel): MeResponse | null {
    return s.me;
  }
  @Selector() static meStatus(s: AuthStateModel): MeStatus {
    return s.meStatus;
  }
  @Selector() static role(s: AuthStateModel): Role | null {
    return s.me?.role ?? null;
  }
  @Selector() static tenantConfig(s: AuthStateModel): TenantConfig | null {
    return s.me?.tenantConfig ?? null;
  }
  @Selector() static mustChangePassword(s: AuthStateModel): boolean {
    return s.me?.mustChangePassword ?? false;
  }

  @Action(Login)
  login(ctx: StateContext<AuthStateModel>, { payload }: Login) {
    return this.auth.login(payload).pipe(
      tap(({ token }) => ctx.patchState({ token, meStatus: 'loading' })),
      switchMap(() => this.auth.me()),
      tap((me) => ctx.patchState({ me, meStatus: 'loaded' })),
    );
  }

  @Action(LoadMe)
  loadMe(ctx: StateContext<AuthStateModel>) {
    ctx.patchState({ meStatus: 'loading' });
    return this.auth.me().pipe(
      tap((me) => ctx.patchState({ me, meStatus: 'loaded' })),
      catchError((err) => {
        ctx.patchState({ meStatus: 'error' });
        return throwError(() => err);
      }),
    );
  }

  @Action(ChangePassword)
  changePassword(ctx: StateContext<AuthStateModel>, { payload }: ChangePassword) {
    return this.auth.changePassword(payload).pipe(
      tap(() => {
        const me = ctx.getState().me;
        if (me) ctx.patchState({ me: { ...me, mustChangePassword: false } });
      }),
    );
  }

  @Action(Logout)
  logout(ctx: StateContext<AuthStateModel>) {
    ctx.setState(DEFAULTS);
    this.router.navigate(['/login']);
  }
}
