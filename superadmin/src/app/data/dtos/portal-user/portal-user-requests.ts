import type { PortalGrant } from '../../../model/enums/portal-user/portal-grant.enum';
import type { PortalUserStatus } from '../../../model/enums/portal-user/portal-user-status.enum';

export interface PortalUserListQuery {
  page?: number;
  limit?: number;
  /** Free text over name, surnames and email. */
  search?: string;
  status?: PortalUserStatus;
  customerId?: string;
  /** Narrows to users holding this grant, live rows only. */
  grant?: PortalGrant;
}
