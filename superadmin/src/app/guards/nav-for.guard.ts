import { NAV, TECH_NAV } from '../model/constants/access/nav-entries.const';
import type { MeResponse } from '../data/dtos/auth';
import type { NavEntry } from '../data/types/access';
import { canAccess } from './can-access.guard';

/** The access matrix applied to the sidebar — a user never sees an entry
 *  `accessGuard` would reject. */
export const navFor = (me: MeResponse | null): NavEntry[] =>
  (me?.role === 'technician' ? TECH_NAV : NAV).filter((e) => canAccess(me, e.module));
