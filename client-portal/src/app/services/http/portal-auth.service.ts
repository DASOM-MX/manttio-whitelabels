import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { PortalChangePasswordInput } from '../../data/dtos/portal-auth/portal-change-password-input.dto';
import type { PortalForgotPasswordInput } from '../../data/dtos/portal-auth/portal-forgot-password-input.dto';
import type { PortalLoginInput } from '../../data/dtos/portal-auth/portal-login-input.dto';
import type { PortalLoginResponse } from '../../data/dtos/portal-auth/portal-login-response.dto';
import type { PortalMeResponse } from '../../data/dtos/portal-auth/portal-me-response.dto';
import type { PortalPasswordChangedResponse } from '../../data/dtos/portal-auth/portal-password-changed-response.dto';
import type { PortalResetPasswordInput } from '../../data/dtos/portal-auth/portal-reset-password-input.dto';

@Injectable({ providedIn: 'root' })
export class PortalAuthService {
  private readonly api = inject(RemoteService);

  login(input: PortalLoginInput): Observable<PortalLoginResponse> {
    return this.api.post<PortalLoginResponse>('/portal/auth/login', input);
  }

  me(): Observable<PortalMeResponse> {
    return this.api.get<PortalMeResponse>('/portal/auth/me');
  }

  changePassword(input: PortalChangePasswordInput): Observable<PortalPasswordChangedResponse> {
    return this.api.post<PortalPasswordChangedResponse>('/portal/auth/password', input);
  }

  forgotPassword(input: PortalForgotPasswordInput): Observable<void> {
    return this.api.post<void>('/portal/auth/forgot-password', input);
  }

  resetPassword(input: PortalResetPasswordInput): Observable<PortalPasswordChangedResponse> {
    return this.api.post<PortalPasswordChangedResponse>('/portal/auth/reset-password', input);
  }
}
