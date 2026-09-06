import type { PortalUserStatus } from '../enums/portal-users.enum';

/** One customer contact's portal-access state (superadmin 26 §6, the customer
 *  detail page's per-contact indicator). `status: null` means the contact has
 *  no live portal user at all — a distinct case, not an omission.
 *
 *  Deliberately thin: no grants, no email, no `isAdmin`. A contact-row badge
 *  only has to answer "can this person log in, and have they" — what they can
 *  do once inside is the concern of 26's own per-user editor. */
export interface PortalContactAccess {
  contactId: string;
  portalUserId: string | null;
  status: PortalUserStatus | null;
  /** Null with no portal user, and also null for one that has never logged
   *  in — "invited and never used" (26 §1) reads as `status: 'invited'` with
   *  `lastLoginAt: null`. */
  lastLoginAt: string | null;
}
