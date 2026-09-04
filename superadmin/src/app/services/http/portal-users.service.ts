import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { GenericQueryResponse } from '../../data/dtos/generic-query-response';
import type { PortalGrant } from '../../model/enums/portal-user/portal-grant.enum';
import type { PortalUserDetail, PortalUserListItem } from '../../data/dtos/portal-user/portal-user';
import type {
  InvitePortalUserRequest,
  InvitePortalUserResult,
  PortalUserListQuery,
  UpdatePortalUserGrantsRequest,
  UpdatePortalUserGrantsResult,
} from '../../data/dtos/portal-user/portal-user-requests';

@Injectable({ providedIn: 'root' })
export class PortalUsersService {
  private readonly remote = inject(RemoteService);

  /** `GET /portal-users` — owner-only on the backend (26 CP-1); an admin
   *  gets 403, so the route never admits one. */
  list(query: PortalUserListQuery): Observable<GenericQueryResponse<PortalUserListItem>> {
    return this.remote.get<GenericQueryResponse<PortalUserListItem>>('/portal-users', {
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      customerId: query.customerId,
      grant: query.grant,
    });
  }

  /** `POST /portal-users` — invite a contact (26 §2). ADMIN_TIER, unlike the
   *  owner-only list above. */
  invite(body: InvitePortalUserRequest): Observable<InvitePortalUserResult> {
    return this.remote.post<InvitePortalUserResult>('/portal-users', body);
  }

  /** `GET /portal-users/:id` — the standalone grants editor's read (26 CP-3).
   *  ADMIN_TIER, unlike the owner-only list above; deliberately thin (26
   *  §3's own DTO comment) — no customer name, no surnames, no last-login. */
  get(id: string): Observable<PortalUserDetail> {
    return this.remote
      .get<{ user: PortalUserDetail }>(`/portal-users/${id}`)
      .pipe(map((res) => res.user));
  }

  /** `PATCH /portal-users/:id/grants` — replaces the live grant set; the
   *  backend revokes what's missing and adds what's new, never a DELETE
   *  (26 §3), so revocation history survives every edit.
   *
   *  `isAdmin` rides the same request (26 §3b, PR #215) but stays optional
   *  here too — pass `undefined` to leave the column untouched. The
   *  response's `isAdmin` is the row read back, not an echo. */
  updateGrants(
    id: string,
    grants: PortalGrant[],
    isAdmin?: boolean,
  ): Observable<UpdatePortalUserGrantsResult> {
    const body: UpdatePortalUserGrantsRequest = { grants };
    if (isAdmin !== undefined) body.isAdmin = isAdmin;
    return this.remote.patch<UpdatePortalUserGrantsResult>(`/portal-users/${id}/grants`, body);
  }

  /** `POST /portal-users/:id/password` — the one backend action behind two
   *  UI-level lifecycle rows (26 §4): "Reenviar invitación" on an `invited`
   *  row and "Restablecer contraseña" on any other. Same effect either way —
   *  new temp password, `must_change_password`, an email — and the temp
   *  password is never in this response (26 §5). */
  resetPassword(id: string): Observable<void> {
    return this.remote
      .post<{ id: string; email: string; name: string }>(`/portal-users/${id}/password`, {})
      .pipe(map(() => undefined));
  }

  /** `PATCH /portal-users/:id/suspend` — reversible; login refused on the
   *  next request. */
  suspend(id: string): Observable<void> {
    return this.remote
      .patch<{ suspended: boolean }>(`/portal-users/${id}/suspend`, {})
      .pipe(map(() => undefined));
  }

  /** `PATCH /portal-users/:id/resume` — the reverse of `suspend`. */
  resume(id: string): Observable<void> {
    return this.remote
      .patch<{ resumed: boolean }>(`/portal-users/${id}/resume`, {})
      .pipe(map(() => undefined));
  }

  /** `DELETE /portal-users/:id` — the permanent one (26 §4): soft delete,
   *  required comment, `deleted_by`. The contact row survives; only the
   *  login goes, and it's re-invitable later. */
  revoke(id: string, deleteComment: string): Observable<void> {
    return this.remote
      .delete<{ id: string; deleted: boolean }>(`/portal-users/${id}`, { deleteComment })
      .pipe(map(() => undefined));
  }
}
