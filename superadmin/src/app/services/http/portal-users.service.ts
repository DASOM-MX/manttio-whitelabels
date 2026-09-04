import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { GenericQueryResponse } from '../../data/dtos/generic-query-response';
import type { PortalUserListItem } from '../../data/dtos/portal-user/portal-user';
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
}
