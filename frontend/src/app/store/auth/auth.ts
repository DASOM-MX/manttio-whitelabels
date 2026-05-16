import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { jwtDecode } from 'jwt-decode';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { JwtPayload } from '../../interfaces/jwt-payload';
import { Login } from './actions/login';
import { Logout } from './actions/logout';
import { AuthStateModel } from './types/auth-state-model';
import { AuthUser } from './types/auth-user';

interface LoginResponse {
  token: string;
  user: { id?: string; email: string; role: boolean };
}

@State<AuthStateModel>({
  name: 'auth',
  defaults: {
    token: null,
    user: null,
  },
})
@Injectable()
export class AuthState {
  private http = inject(HttpClient);

  @Selector()
  static token(state: AuthStateModel): string | null {
    return state.token;
  }

  @Selector()
  static user(state: AuthStateModel): AuthUser | null {
    return state.user;
  }

  @Selector()
  static isAdmin(state: AuthStateModel): boolean {
    return state.user?.role === true;
  }

  @Selector()
  static isAuthenticated(state: AuthStateModel): boolean {
    return !!state.token;
  }

  @Action(Login)
  login(ctx: StateContext<AuthStateModel>, { email, password }: Login) {
    return this.http
      .post<LoginResponse>(`${environment.apiUrl}auth/login`, { email, password })
      .pipe(
        tap((response) => {
          const decoded = jwtDecode<JwtPayload>(response.token);
          ctx.patchState({
            token: response.token,
            user: {
              id: decoded.sub,
              email: response.user.email,
              role: response.user.role,
            },
          });
        }),
      );
  }

  @Action(Logout)
  logout(ctx: StateContext<AuthStateModel>) {
    ctx.setState({ token: null, user: null });
  }
}
