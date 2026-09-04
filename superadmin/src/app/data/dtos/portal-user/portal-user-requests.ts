import type { GenericQueryResponse } from '../generic-query-response';
import type { PortalGrant } from '../../../model/enums/portal-user/portal-grant.enum';
import type { PortalUserStatus } from '../../../model/enums/portal-user/portal-user-status.enum';

/** Paging is derived from the one envelope (21 §2), not re-typed: `page`/`limit`
 *  mean here exactly what they mean in the response, optional because the server
 *  defaults them. */
export interface PortalUserListQuery
  extends Partial<Pick<GenericQueryResponse<unknown>, 'page' | 'limit'>> {
  /** Free text over name, surnames and email. */
  search?: string;
  status?: PortalUserStatus;
  customerId?: string;
  /** Narrows to users holding this grant, live rows only. */
  grant?: PortalGrant;
}

/** `POST /portal-users` body (26 §2). No email field — the backend reads it
 *  off the contact row, so a wrong address is fixed on the contact, never
 *  typed into a credential. */
export interface InvitePortalUserRequest {
  contactId: string;
  grants: PortalGrant[];
  isAdmin: boolean;
}

/** What the invite returns — never the temp password (26 §5), which is
 *  mailed only. */
export interface InvitePortalUserResult {
  id: string;
  email: string;
  name: string;
  customerId: string;
}
