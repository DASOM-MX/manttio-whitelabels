import type { ChangePasswordRequest, LoginRequest } from '../../app/data/dtos/auth';

export class Login {
  static readonly type = '[Auth] Login';
  constructor(public payload: LoginRequest) {}
}

/** Fetch `GET /auth/me` — dispatched right after login and on app boot when a
 *  token exists. The shell splashes until it lands (02-app-shell.md §3). */
export class LoadMe {
  static readonly type = '[Auth] Load Me';
}

/** Change own password (forced-change dialog); clears `mustChangePassword`. */
export class ChangePassword {
  static readonly type = '[Auth] Change Password';
  constructor(public payload: ChangePasswordRequest) {}
}

export class Logout {
  static readonly type = '[Auth] Logout';
}
