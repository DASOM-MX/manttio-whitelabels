import type { Role } from '../../users/enums/users.enum';

/** Who schedules (12 §2): creating a visit and correcting an open one are
 *  office work. Technicians are deliberately absent — they act on visits
 *  through the lifecycle routes, they don't plan them. */
export const VISIT_STAFF_ROLES: Role[] = ['owner', 'admin', 'office'];
