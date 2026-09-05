import type { PortalUserStatus } from '../../../model/enums/portal-user/portal-user-status.enum';

/** `GET /customers/:id/portal-access` (26 CP-5, PR #220) — the 07 contact
 *  row's read-only indicator. One entry per **live** contact of that
 *  customer, whether or not they have portal access; bare unpaged array
 *  (a contact roster is small).
 *
 *  Keyed on `contactId` — never match this back to a contact by email (01
 *  §1: a portal user's email is independent of its contact's after invite).
 *
 *  A revoked portal user reads identically to a never-invited contact: all
 *  three nullable fields null. That's deliberate — a revoked login is no
 *  access — so the UI must not try to tell the two apart. */
export interface PortalContactAccess {
  contactId: string;
  portalUserId: string | null;
  status: PortalUserStatus | null;
  lastLoginAt: string | null;
}
