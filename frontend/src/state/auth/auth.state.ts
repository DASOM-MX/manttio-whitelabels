import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext } from '@ngxs/store';
import { Router } from '@angular/router';
import { switchMap, tap } from 'rxjs/operators';
import { AuthService } from '../../http/auth.service';
import { UsersService } from '../../http/users.service';
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
  private readonly auth = inject(AuthService);
  private readonly users = inject(UsersService);
  private readonly router = inject(Router);

  @Selector() static token(s: AuthStateModel): string | null { return s.token; }
  @Selector() static user(s: AuthStateModel): PublicUser | null { return s.user; }
  @Selector() static role(s: AuthStateModel): UserType | null { return s.user?.role ?? null; }
  @Selector() static email(s: AuthStateModel): string | null { return s.user?.email ?? null; }
  @Selector() static isAuthenticated(s: AuthStateModel): boolean { return !!s.token; }

  @Action(Login)
  login(ctx: StateContext<AuthStateModel>, { payload }: Login) {
    return this.auth.login(payload).pipe(
      tap(({ token }) => ctx.patchState({ token })),
      switchMap(() => this.users.me()),
      tap(({ user }) => ctx.patchState({ user })),
    );
  }

  @Action(LoadCurrentUser)
  loadCurrentUser(ctx: StateContext<AuthStateModel>) {
    return this.users.me().pipe(tap(({ user }) => ctx.patchState({ user })));
  }

  @Action(Logout)
  logout(ctx: StateContext<AuthStateModel>) {
    ctx.setState({ token: null, user: null });
    this.router.navigate(['/login']);
  }
}
