import type { portalUsers } from '../models/portal-users.model';
import type { PortalGrant } from '../enums/portal-grants.enum';

/** The portal JWT's claim set (02 §1). Signed with `PORTAL_JWT_SECRET`, never
 *  the staff secret, and `typ` is the discriminator that keeps the two surfaces
 *  apart: `portalJwtMiddleware` rejects anything without it, so a staff token
 *  cannot reach `/portal/*` even if both surfaces were given the same secret.
 *
 *  `cid` is the customer scope at issue time. It is validated on every request
 *  but deliberately not trusted as the scope — `portalJwtMiddleware` reads
 *  `customerId` from the database row instead, so a token can never widen its
 *  own reach. */
export type PortalTokenPayload = {
  /** The portal user's id. */
  sub: string;
  /** The customer this user belongs to, as of issue time. */
  cid: string;
  typ: 'portal';
};

export type NewPortalUser = {
  contactId: string;
  customerId: string;
  email: string;
  passwordHash: string;
  name: string;
  paternalLastName?: string | null;
  maternalLastName?: string | null;
  role?: string | null;
  isAdmin: boolean;
  invitedBy: string | null;
};


/** A `portal_users` row with the two joins and the grant set the tenant-wide
 *  list needs (superadmin 26 §1). The repository shape — the controller maps it
 *  to `PortalUserListItem`, which is what actually goes on the wire. */
export type PortalUserListRow = typeof portalUsers.$inferSelect & {
  customerName: string | null;
  invitedByName: string | null;
  grants: PortalGrant[];
};
