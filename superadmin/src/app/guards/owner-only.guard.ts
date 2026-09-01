import type { Role } from '../data/dtos/auth';

/** Owner-only gate (26 CP-1). `GET /portal-users` is narrower than the rest
 *  of the portal-access module, which is admin-tier: the roster of every
 *  external person with access to the tenant's documents is held closest, and
 *  an admin gets 403. Read by both gates — the access matrix (which filters
 *  the sidebar) and the route's `data.roles` (which `accessGuard` matches on,
 *  so the bundle is never even requested). */
export const OWNER_ONLY: readonly Role[] = ['owner'];
