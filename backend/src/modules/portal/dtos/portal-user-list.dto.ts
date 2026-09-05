import type { PortalGrant } from '../enums/portal-grants.enum';
import type { PortalUserStatus } from '../enums/portal-users.enum';

/** One row of the tenant-wide portal-access list (superadmin 26 §1).
 *
 *  Deliberately flat and display-shaped: the page is a `p-table`, and every
 *  column it renders is a field here, so it never has to fan out per row.
 *
 *  Two fields exist for support rather than for browsing:
 *  - `lockedUntil` is the A3 lockout. The portal login says nothing about being
 *    locked (saying so would hand an attacker an oracle), so this list is the
 *    only place anyone can answer "no me deja entrar". It self-clears; there is
 *    no unlock action.
 *  - `lastLoginAt` null on an `invited` row is the state 26 §1 calls out as the
 *    one that matters — an invite that silently failed. */
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
  /** Joined for the deep-link into 07; null only if the customer vanished. */
  customerName: string | null;
  /** Live grants only — revoked rows are history, not access. */
  grants: PortalGrant[];
  lastLoginAt: string | null;
  /** Display name of the staff member who sent the invite. */
  invitedByName: string | null;
  /** Only ever set when in the future; a lapsed lock reads as null. */
  lockedUntil: string | null;
  createdAt: string;
}

/** Response body for `PATCH /portal-users/:id/grants` (owner, 2026-09-04).
 *  `isAdmin` always reflects the row's current value: taken from the request
 *  when that key was present, read back unchanged otherwise — a grants-only
 *  PATCH must never move it. */
export interface PortalUserGrantsUpdateResult {
  grants: PortalGrant[];
  isAdmin: boolean;
}
