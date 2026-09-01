import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { PortalLoginResponse } from '../../data/dtos/portal-auth/portal-login-response.dto';
import type { PortalMeResponse } from '../../data/dtos/portal-auth/portal-me-response.dto';

export interface PortalLoginInput {
  email: string;
  password: string;
  turnstileToken: string;
}

export interface PortalChangePasswordInput {
  password: string;
}

export interface PortalForgotPasswordInput {
  email: string;
  turnstileToken: string;
}

export interface PortalResetPasswordInput {
  token: string;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class PortalAuthService {
  private readonly api = inject(RemoteService);

  login(input: PortalLoginInput): Observable<PortalLoginResponse> {
    return this.api.post<PortalLoginResponse>('/portal/auth/login', input);
  }

  me(): Observable<PortalMeResponse> {
    return this.api.get<PortalMeResponse>('/portal/auth/me');
  }

  changePassword(input: PortalChangePasswordInput): Observable<{ changed: boolean }> {
    return this.api.post<{ changed: boolean }>('/portal/auth/password', input);
  }

  forgotPassword(input: PortalForgotPasswordInput): Observable<void> {
    return this.api.post<void>('/portal/auth/forgot-password', input);
  }

  resetPassword(input: PortalResetPasswordInput): Observable<{ changed: boolean }> {
    return this.api.post<{ changed: boolean }>('/portal/auth/reset-password', input);
  }
}
