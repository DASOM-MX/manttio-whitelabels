import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { LoginRequest, LoginResponse } from '../app/data/dtos/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly remote = inject(RemoteService);

  login(body: LoginRequest): Observable<LoginResponse> {
    return this.remote.post<LoginResponse>('/auth/login', body);
  }
}
