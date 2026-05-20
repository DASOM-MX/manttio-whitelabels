import { Injectable } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { Login, LoadCurrentUser, Logout } from './auth.actions';
import type { PublicUser } from '../../app/data/dtos/user';
import type { UserType } from '../../app/data/types/user';

export interface AuthStateModel {
  token: string | null;
  user: PublicUser | null;
}

@State<AuthStateModel>({
  name: 'auth',
  defaults: { token: null, user: null },
})
@Injectable()
export class AuthState {
  @Selector() static token(s: AuthStateModel): string | null { return s.token; }
  @Selector() static user(s: AuthStateModel): PublicUser | null { return s.user; }
  @Selector() static role(s: AuthStateModel): UserType | null { return s.user?.role ?? null; }
  @Selector() static email(s: AuthStateModel): string | null { return s.user?.email ?? null; }
  @Selector() static isAuthenticated(s: AuthStateModel): boolean { return !!s.token; }

  @Action(Login)
  login(_ctx: StateContext<AuthStateModel>, _action: Login) {
    // stub — wired up in PR #2 once AuthService + UsersService exist
  }

  @Action(LoadCurrentUser)
  loadCurrentUser(_ctx: StateContext<AuthStateModel>) {
    // stub — wired up in PR #2 once UsersService exists
  }

  @Action(Logout)
  logout(ctx: StateContext<AuthStateModel>) {
    ctx.setState({ token: null, user: null });
  }
}
