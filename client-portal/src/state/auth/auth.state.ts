import { Injectable, inject } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { catchError, of, tap } from 'rxjs';
import {
  AuthLogin,
  AuthLoadMe,
  AuthChangePassword,
  AuthForgotPassword,
  AuthResetPassword,
  AuthLogout,
  AuthSetMustChangePassword,
  AuthSetUser,
} from './auth.actions';
import { PortalAuthService } from '../../app/services/http/portal-auth.service';
import type { PortalMeResponse } from '../../app/data/dtos/portal-auth/portal-me-response.dto';
import type { PortalGrant } from '../../app/model/enums/portal-auth/portal-grants.enum';

const AUTH_TOKEN_KEY = 'portal_auth_token';

export interface AuthStateModel {
  token: string | null;
  user: PortalMeResponse | null;
  grants: PortalGrant[];
  mustChangePassword: boolean;
  loading: boolean;
  error: string | null;
}

@State<AuthStateModel>({
  name: 'auth',
  defaults: {
    token: typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null,
    user: null,
    grants: [],
    mustChangePassword: false,
    loading: false,
    error: null,
  },
})
@Injectable()
export class AuthState {
  private readonly api = inject(PortalAuthService);

  @Selector()
  static token(state: AuthStateModel): string | null {
    return state.token;
  }

  @Selector()
  static user(state: AuthStateModel): PortalMeResponse | null {
    return state.user;
  }

  @Selector()
  static grants(state: AuthStateModel): PortalGrant[] {
    return state.grants;
  }

  @Selector()
  static mustChangePassword(state: AuthStateModel): boolean {
    return state.mustChangePassword;
  }

  @Selector()
  static isAuthenticated(state: AuthStateModel): boolean {
    return state.token !== null;
  }

  @Selector()
  static loading(state: AuthStateModel): boolean {
    return state.loading;
  }

  @Selector()
  static error(state: AuthStateModel): string | null {
    return state.error;
  }

  @Action(AuthLogin)
  login(ctx: StateContext<AuthStateModel>, action: AuthLogin) {
    ctx.patchState({ loading: true, error: null });
    return this.api.login(action.payload).pipe(
      tap((result) => {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(AUTH_TOKEN_KEY, result.token);
        }
        ctx.patchState({
          token: result.token,
          mustChangePassword: result.mustChangePassword,
          loading: false,
        });
      }),
      catchError((err) => {
        const message = err?.error?.message || 'Login failed';
        ctx.patchState({
          loading: false,
          error: message,
        });
        throw err;
      }),
    );
  }

  @Action(AuthLoadMe)
  loadMe(ctx: StateContext<AuthStateModel>) {
    ctx.patchState({ loading: true, error: null });
    return this.api.me().pipe(
      tap((me) => {
        ctx.patchState({
          user: me,
          grants: me.grants,
          mustChangePassword: me.mustChangePassword,
          loading: false,
        });
      }),
      catchError((err) => {
        const message = err?.error?.message || 'Failed to load user';
        ctx.patchState({
          loading: false,
          error: message,
        });
        throw err;
      }),
    );
  }

  @Action(AuthChangePassword)
  changePassword(ctx: StateContext<AuthStateModel>, action: AuthChangePassword) {
    ctx.patchState({ loading: true, error: null });
    return this.api.changePassword(action.payload).pipe(
      tap(() => {
        ctx.patchState({
          mustChangePassword: false,
          loading: false,
        });
      }),
      catchError((err) => {
        const message = err?.error?.message || 'Failed to change password';
        ctx.patchState({
          loading: false,
          error: message,
        });
        throw err;
      }),
    );
  }

  @Action(AuthForgotPassword)
  forgotPassword(ctx: StateContext<AuthStateModel>, action: AuthForgotPassword) {
    ctx.patchState({ loading: true, error: null });
    return this.api.forgotPassword(action.payload).pipe(
      tap(() => {
        ctx.patchState({
          loading: false,
        });
      }),
      catchError((err) => {
        const message = err?.error?.message || 'Failed to send reset email';
        ctx.patchState({
          loading: false,
          error: message,
        });
        throw err;
      }),
    );
  }

  @Action(AuthResetPassword)
  resetPassword(ctx: StateContext<AuthStateModel>, action: AuthResetPassword) {
    ctx.patchState({ loading: true, error: null });
    return this.api.resetPassword(action.payload).pipe(
      tap(() => {
        ctx.patchState({
          loading: false,
        });
      }),
      catchError((err) => {
        const message = err?.error?.message || 'Failed to reset password';
        ctx.patchState({
          loading: false,
          error: message,
        });
        throw err;
      }),
    );
  }

  @Action(AuthLogout)
  logout(ctx: StateContext<AuthStateModel>) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
    ctx.setState({
      token: null,
      user: null,
      grants: [],
      mustChangePassword: false,
      loading: false,
      error: null,
    });
  }

  @Action(AuthSetMustChangePassword)
  setMustChangePassword(ctx: StateContext<AuthStateModel>, action: AuthSetMustChangePassword) {
    ctx.patchState({ mustChangePassword: action.payload });
  }

  @Action(AuthSetUser)
  setUser(ctx: StateContext<AuthStateModel>, action: AuthSetUser) {
    ctx.patchState({
      user: action.payload,
      grants: action.payload.grants,
      mustChangePassword: action.payload.mustChangePassword,
    });
  }
}
