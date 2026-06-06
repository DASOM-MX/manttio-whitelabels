import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  CreateUserRequest, UpdateUserRequest, DeleteUserRequest,
  UserResponse, UserListResponse, DeleteUserResponse,
} from '../app/data/dtos/user';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly remote = inject(RemoteService);

  me(): Observable<UserResponse> { return this.remote.get<UserResponse>('/users/me'); }
  list(): Observable<UserListResponse> { return this.remote.get<UserListResponse>('/users/list'); }
  get(id: string): Observable<UserResponse> { return this.remote.get<UserResponse>(`/users/${id}`); }
  create(body: CreateUserRequest): Observable<UserResponse> { return this.remote.post<UserResponse>('/users', body); }
  update(id: string, body: UpdateUserRequest): Observable<UserResponse> { return this.remote.patch<UserResponse>(`/users/${id}`, body); }
  remove(id: string, body: DeleteUserRequest): Observable<DeleteUserResponse> {
    return this.remote.delete<DeleteUserResponse>(`/users/${id}`, body);
  }
}
