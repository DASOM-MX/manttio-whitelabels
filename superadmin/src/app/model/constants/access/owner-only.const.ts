import type { Role } from '../../../data/dtos/auth';

/** `GET /portal-users` is owner-only where the rest of the module is
 *  admin-tier (26 CP-1). Read by both gates — the access matrix and the route. */
export const OWNER_ONLY: readonly Role[] = ['owner'];
