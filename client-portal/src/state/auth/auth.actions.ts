import type { PortalLoginInput } from '../../app/services/http/portal-auth.service';
import type { PortalMeResponse } from '../../app/data/dtos/portal-auth/portal-me-response.dto';

export class AuthLogin {
  static readonly type = '[Auth] Login';
  constructor(public payload: PortalLoginInput) {}
}

export class AuthLoadMe {
  static readonly type = '[Auth] Load Me';
}

export class AuthChangePassword {
  static readonly type = '[Auth] Change Password';
  constructor(public payload: { password: string }) {}
}

export class AuthForgotPassword {
  static readonly type = '[Auth] Forgot Password';
  constructor(public payload: { email: string; turnstileToken: string }) {}
}

export class AuthResetPassword {
  static readonly type = '[Auth] Reset Password';
  constructor(public payload: { token: string; password: string }) {}
}

export class AuthLogout {
  static readonly type = '[Auth] Logout';
}

export class AuthSetMustChangePassword {
  static readonly type = '[Auth] Set Must Change Password';
  constructor(public payload: boolean) {}
}

export class AuthSetUser {
  static readonly type = '[Auth] Set User';
  constructor(public payload: PortalMeResponse) {}
}
