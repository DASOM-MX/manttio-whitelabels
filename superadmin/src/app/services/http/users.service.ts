import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { PagedResponse } from '../../data/dtos/paged-response';
import type {
  AssignableUser,
  CreateUserRequest,
  CreateUserResponse,
  DeleteUserRequest,
  ResetPasswordResponse,
  UpdateUserRequest,
  User,
  UserListQuery,
} from '../../data/dtos/user';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly remote = inject(RemoteService);

  list(query: UserListQuery): Observable<PagedResponse<User>> {
    return this.remote.get<PagedResponse<User>>('/users', {
      page: query.page,
      limit: query.limit,
      search: query.search,
      role: query.role,
      active: query.active === '' || query.active === undefined ? undefined : String(query.active),
    });
  }

  /** The roster for assignment pickers, name-sorted with display names
   *  precomposed — one page of 100 covers any real tenant's staff. */
  listAssignable(): Observable<AssignableUser[]> {
    return this.list({ limit: 100 }).pipe(
      map((res) =>
        res.items
          .map((u) => ({
            id: u.id,
            name: u.name,
            paternalLastName: u.paternalLastName,
            fullName: [u.name, u.paternalLastName].filter(Boolean).join(' '),
          }))
          .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')),
      ),
    );
  }

  get(id: string): Observable<User> {
    return this.remote.get<User>(`/users/${id}`);
  }

  create(body: CreateUserRequest): Observable<CreateUserResponse> {
    return this.remote.post<CreateUserResponse>('/users', body);
  }

  update(id: string, body: UpdateUserRequest): Observable<User> {
    return this.remote.patch<User>(`/users/${id}`, body);
  }

  /** Role-gated temp-password reset (05 §2); response shown exactly once. */
  resetPassword(id: string): Observable<ResetPasswordResponse> {
    return this.remote.post<ResetPasswordResponse>(`/users/${id}/password`, {});
  }

  remove(id: string, body: DeleteUserRequest): Observable<void> {
    return this.remote.delete<void>(`/users/${id}`, body);
  }
}
