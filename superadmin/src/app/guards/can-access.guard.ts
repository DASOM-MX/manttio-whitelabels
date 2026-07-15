import { MODULE_ROLES } from '../model/constants/access/module-roles.const';
import type { MeResponse, Role } from '../data/dtos/auth';
import type { ModuleKey } from '../data/types/access';
import { hasModule } from './has-module.guard';
import { hasRole } from './has-role.guard';

/** The access matrix composed (14-access-control.md §3): module availability
 *  × user role. Route `data`, the nav filter, and in-page `@if`s all consume
 *  the guards in this folder — matrix logic is never duplicated in
 *  components. The backend enforces every call regardless; this is UX +
 *  bundle hygiene, not security. Keeping it centralized is what makes the
 *  future SSR flip mechanical (14 §5). */
export const canAccess = (
  me: MeResponse | null,
  module: ModuleKey,
  roles?: readonly Role[],
): boolean => !!me && hasModule(me, module) && hasRole(me, roles ?? MODULE_ROLES[module]);
