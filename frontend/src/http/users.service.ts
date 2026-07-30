import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  CreateUserRequest, UpdateUserRequest, DeleteUserRequest,
  UserResponse, UserListResponse, DeleteUserResponse, PublicUser,
} from '../app/data/dtos/user';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly remote = inject(RemoteService);

  me(): Observable<UserResponse> { return this.remote.get<UserResponse>('/users/me'); }
  // The legacy /users/list was retired 2026-07-28 for the paged GET /users;
  // one page of 100 covers any real tenant's staff.
  list(): Observable<UserListResponse> {
    return this.remote
      .get<{ items: PublicUser[] }>('/users', { limit: 100 })
      .pipe(map((res) => ({ users: res.items })));
  }
  get(id: string): Observable<UserResponse> { return this.remote.get<UserResponse>(`/users/${id}`); }
  create(body: CreateUserRequest): Observable<UserResponse> { return this.remote.post<UserResponse>('/users', body); }
  update(id: string, body: UpdateUserRequest): Observable<UserResponse> { return this.remote.patch<UserResponse>(`/users/${id}`, body); }
  remove(id: string, body: DeleteUserRequest): Observable<DeleteUserResponse> {
    return this.remote.delete<DeleteUserResponse>(`/users/${id}`, body);
  }
}
