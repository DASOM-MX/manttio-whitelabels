import type { PortalGrant } from '../enums/portal-grants.enum';

/** `GET /portal-users/:id` — the staff-side detail behind superadmin 26 §3.
 *
 *  `isOnlyAdmin` exists for the warning on the `is_admin` toggle (26 §3b): a
 *  customer may legitimately have no admin, but nobody can then close its
 *  service requests (01 §4 — staff have no close action), so staff are told
 *  before they remove the last one. It counts *effective* admins, so a
 *  suspended one does not mask the warning. False when this user is not an
 *  admin at all. */
export interface PortalUserAdminDetail {
  id: string;
  email: string;
  name: string;
  status: string;
  isAdmin: boolean;
  isOnlyAdmin: boolean;
  grants: PortalGrant[];
}
