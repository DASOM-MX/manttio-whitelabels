import type { Role } from '../../users/enums/users.enum';

/** Who may act on a visit's lifecycle — assign, respond, close, reschedule
 *  (12 §2). Technicians are admitted at the route, but the role gate is only
 *  half the rule: the service additionally requires the visit to be *theirs*,
 *  which is what lets a technician hand off their own visit (§2a swap) without
 *  ever pulling a colleague's. Role alone cannot express that. */
export const VISIT_ACTOR_ROLES: Role[] = ['owner', 'admin', 'office', 'technician'];
