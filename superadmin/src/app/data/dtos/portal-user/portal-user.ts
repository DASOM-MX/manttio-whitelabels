import type { PortalGrant } from '../../../model/enums/portal-user/portal-grant.enum';
import type { PortalUserStatus } from '../../../model/enums/portal-user/portal-user-status.enum';

/** One row of the tenant-wide portal-access list (26 §1) — flat and
 *  display-shaped, so the table never fans out per row. */
export interface PortalUserListItem {
  id: string;
  name: string;
  paternalLastName: string | null;
  maternalLastName: string | null;
  email: string;
  /** Free-text job title, not a permission — `isAdmin` is the capability. */
  role: string | null;
  status: PortalUserStatus;
  isAdmin: boolean;
  customerId: string;
  /** Joined for the deep link into 07; null only if the customer vanished. */
  customerName: string | null;
  /** Live grants only — revoked rows are history, not access. */
  grants: PortalGrant[];
  lastLoginAt: string | null;
  invitedByName: string | null;
  /** Only ever set when in the future; the badge lands in CP-5. */
  lockedUntil: string | null;
  createdAt: string;
}
