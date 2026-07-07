import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
  MeResponse,
} from '../../data/dtos/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly remote = inject(RemoteService);

  login(body: LoginRequest): Observable<LoginResponse> {
    return this.remote.post<LoginResponse>('/auth/login', body);
  }

  /** The single gating input: `{ user, role, tenantConfig, mustChangePassword }`. */
  me(): Observable<MeResponse> {
    return this.remote.get<MeResponse>('/auth/me');
  }

  /** Change own password; backend clears `mustChangePassword`. */
  changePassword(body: ChangePasswordRequest): Observable<void> {
    return this.remote.post<void>('/auth/password', body);
  }
}
