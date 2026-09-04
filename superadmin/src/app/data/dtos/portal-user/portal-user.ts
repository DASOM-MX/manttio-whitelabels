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

/** `GET /portal-users/:id` (26 CP-3) — thin by contract: staff-admin display
 *  for one portal user, not the list row. No customer name, no surnames, no
 *  last-login/invited-by/locked-until — those live only on the list read
 *  (26 §1); this is the grants-editor's own shape. */
export interface PortalUserDetail {
  id: string;
  email: string;
  name: string;
  status: PortalUserStatus;
  isAdmin: boolean;
  /** Live grants only — same contract as the list row. */
  grants: PortalGrant[];
}

