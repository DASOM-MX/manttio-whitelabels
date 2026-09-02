import type { PortalGrant } from '../enums/portal-grants.enum';

/** The signed-in contact. No `contactId` — the portal never needs it, and the
 *  customer's other contacts are not this user's business (02 §5). */
export interface PortalMeUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
}

/** Name only. The scope is the token's; the client never sends a customer id. */
export interface PortalMeCustomer {
  id: string;
  name: string;
}

/** Read per request, never from the token — a revoked grant takes effect on the
 *  next call (02 §1). */
export interface PortalMeResponse {
  user: PortalMeUser;
  customer: PortalMeCustomer;
  grants: PortalGrant[];
  mustChangePassword: boolean;
}
