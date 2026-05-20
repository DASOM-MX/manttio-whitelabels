import type { LoginRequest } from '../../app/data/dtos/auth';

export class Login {
  static readonly type = '[Auth] Login';
  constructor(public payload: LoginRequest) {}
}

export class LoadCurrentUser {
  static readonly type = '[Auth] Load Current User';
}

export class Logout {
  static readonly type = '[Auth] Logout';
}
