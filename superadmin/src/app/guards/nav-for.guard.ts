import { NAV, TECH_NAV } from '../model/constants/access/nav-entries.const';
import type { MeResponse } from '../data/dtos/auth';
import type { NavEntry } from '../data/types/access/nav-entry.type';
import { canAccess } from './can-access.guard';

/** The access matrix applied to the sidebar — a user never sees an entry
 *  `accessGuard` would reject, including children carrying a narrower
 *  role gate than their parent module. */
export const navFor = (me: MeResponse | null): NavEntry[] =>
  (me?.role === 'technician' ? TECH_NAV : NAV)
    .filter((e) => canAccess(me, e.module))
    .map((e) =>
      e.children
        ? {
            ...e,
            children: e.children.filter((c) => !c.roles || (!!me && c.roles.includes(me.role))),
          }
        : e,
    );
