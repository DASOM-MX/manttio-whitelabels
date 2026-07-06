/** access.ts — the single place gating logic lives (14-access-control.md §3).
 *
 *  Gating is two-dimensional: tenant config (which modules the instance has)
 *  × user role (what the user may do inside them). Route `data`, the nav
 *  filter, and in-page `@if`s all consume these helpers — matrix logic is
 *  never duplicated in components. The backend enforces every call
 *  regardless; this is UX + bundle hygiene, not security.
 *
 *  Keeping it centralized is what makes the future SSR flip mechanical
 *  (14 §5).
 */
import type { LucideIcon } from '@lucide/angular';
import { MODULE_ROLES } from './model/constants/access/module-roles.const';
import { MODULE_FLAG } from './model/constants/access/module-flags.const';
import { NAV, TECH_NAV } from './model/constants/access/nav-entries.const';
import type { MeResponse, Role } from './data/dtos/auth';

export type ModuleKey =
  | 'dashboard'
  | 'users'
  | 'reports'
  | 'templates'
  | 'customers'
  | 'equipment'
  | 'calendar'
  | 'contracts'
  | 'billing'
  | 'branding'
  | 'cms'
  | 'wms';

export const hasRole = (me: MeResponse | null, roles: readonly Role[]): boolean =>
  !!me && roles.includes(me.role);

export const hasModule = (me: MeResponse | null, module: ModuleKey): boolean => {
  const flag = MODULE_FLAG[module];
  return !flag || !!me?.tenantConfig?.modules?.[flag];
};

export const canAccess = (
  me: MeResponse | null,
  module: ModuleKey,
  roles?: readonly Role[],
): boolean => !!me && hasModule(me, module) && hasRole(me, roles ?? MODULE_ROLES[module]);

/** Password-reset pairings (14 §2 note 1): owner resets admins/office/techs;
 *  admins reset office/techs only; nobody in-tenant resets the owner. The
 *  backend enforces the same pairs — this only gates the UI. */
export const canResetPassword = (actor: Role | null, target: Role): boolean => {
  if (target === 'owner') return false;
  if (actor === 'owner') return true;
  return actor === 'admin' && (target === 'office' || target === 'technician');
};

/** Owner protection (14 §2 note 1): admins can't edit/delete the owner
 *  account or grant `owner`. */
export const canManageUser = (actor: Role | null, target: Role): boolean =>
  target !== 'owner' || actor === 'owner';

/** Default landing route per role (02 §4): owner/admin/office → dashboard;
 *  technicians → calendar, falling back to their reports when the tenant has
 *  no `scheduling`. */
export const defaultRouteFor = (me: MeResponse | null): string => {
  if (!me) return '/login';
  if (me.role === 'technician') {
    return hasModule(me, 'calendar') ? '/calendar' : '/reports';
  }
  return '/dashboard';
};

// ── Navigation ────────────────────────────────────────────────────────────

export interface NavChild {
  label: string;
  route: string;
  /** Exact-match highlight — set when sibling routes nest under this one. */
  exact?: boolean;
}

export interface NavEntry {
  label: string;
  icon: LucideIcon;
  route: string;
  module: ModuleKey;
  /** Exact-match highlight — set when sibling routes nest under this one. */
  exact?: boolean;
  children?: NavChild[];
}

/** Sidebar entries `(tenantConfig, role)` allow — a user never sees an entry
 *  the route guard would reject. */
export const navFor = (me: MeResponse | null): NavEntry[] =>
  (me?.role === 'technician' ? TECH_NAV : NAV).filter((e) => canAccess(me, e.module));
