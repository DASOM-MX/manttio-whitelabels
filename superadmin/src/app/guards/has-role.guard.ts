import type { MeResponse, Role } from '../data/dtos/auth';

/** Role gate (14-access-control.md §2): what the signed-in user may do
 *  inside a module. In-page action gating (e.g. admin read-only on branding)
 *  consumes this directly. */
export const hasRole = (me: MeResponse | null, roles: readonly Role[]): boolean =>
  !!me && roles.includes(me.role);
