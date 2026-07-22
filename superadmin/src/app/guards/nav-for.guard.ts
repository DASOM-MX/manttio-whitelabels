import { NAV, TECH_NAV } from '../model/constants/access/nav-entries.const';
import type { MeResponse } from '../data/dtos/auth';
import type { NavEntry } from '../data/types/access/nav-entry.type';
import { canAccess } from './can-access.guard';

/** The access matrix applied to the sidebar — a user never sees an entry
 *  `accessGuard` would reject. Gates compose top-down: an entry's `module`
 *  hides the whole subtree, each child's `module` hides that child, and a
 *  group whose children were all filtered out disappears with them. */
export const navFor = (me: MeResponse | null): NavEntry[] =>
  (me?.role === 'technician' ? TECH_NAV : NAV)
    .filter((e) => !e.module || canAccess(me, e.module))
    .map((e) =>
      e.children
        ? { ...e, children: e.children.filter((c) => !c.module || canAccess(me, c.module)) }
        : e,
    )
    .filter((e) => !e.children || e.children.length > 0);
