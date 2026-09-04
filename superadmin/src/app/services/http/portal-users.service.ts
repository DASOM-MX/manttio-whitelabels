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
   *  (26 §3), so revocation history survives every edit. */
  updateGrants(id: string, grants: PortalGrant[]): Observable<PortalGrant[]> {
    return this.remote
      .patch<{ grants: PortalGrant[] }>(`/portal-users/${id}/grants`, { grants })
      .pipe(map((res) => res.grants));
  }
}
