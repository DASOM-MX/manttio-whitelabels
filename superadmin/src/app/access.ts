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
import {
  LucideBuilding2,
  LucideCalendarDays,
  LucideFileText,
  LucideLayoutDashboard,
  LucideLayoutTemplate,
  LucideNewspaper,
  LucidePackage,
  LucidePackageSearch,
  LucidePalette,
  LucideReceiptText,
  LucideScrollText,
  LucideUsers,
  LucideWarehouse,
} from '@lucide/angular';
import type { MeResponse, Role, TenantModules } from './data/dtos/auth';

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

/** Access matrix (14-access-control.md §2) — roles that may enter each module.
 *  In-page action gating (e.g. admin read-only on branding, office draft-only
 *  on billing/contracts) stays inside each module via `hasRole`. */
export const MODULE_ROLES: Record<ModuleKey, readonly Role[]> = {
  dashboard: ['owner', 'admin', 'office'],
  users: ['owner', 'admin'],
  reports: ['owner', 'admin', 'office', 'technician'],
  templates: ['owner', 'admin'],
  customers: ['owner', 'admin', 'office'],
  equipment: ['owner', 'admin', 'office'],
  calendar: ['owner', 'admin', 'office', 'technician'],
  contracts: ['owner', 'admin', 'office'],
  billing: ['owner', 'admin', 'office'],
  branding: ['owner', 'admin'],
  cms: ['owner', 'admin'],
  wms: ['owner', 'admin', 'office', 'technician'],
};

/** Config flag each module rides on; absent = core, always on. Equipment and
 *  CRM ride core clients; `scheduling` covers calendar + contracts (tentative
 *  flag split — open item in 14). Brand is core: it themes apps and PDFs,
 *  not just the website. */
export const MODULE_FLAG: Partial<Record<ModuleKey, keyof TenantModules>> = {
  billing: 'billing',
  wms: 'wms',
  cms: 'cms',
  calendar: 'scheduling',
  contracts: 'scheduling',
};

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

/** Full nav, owner/admin shape (02 §4); office loses entries via the matrix. */
const NAV: NavEntry[] = [
  { label: 'Panel', icon: LucideLayoutDashboard, route: '/dashboard', module: 'dashboard' },
  { label: 'Calendario', icon: LucideCalendarDays, route: '/calendar', module: 'calendar' },
  { label: 'Usuarios', icon: LucideUsers, route: '/users', module: 'users' },
  { label: 'Reportes', icon: LucideFileText, route: '/reports', module: 'reports' },
  { label: 'Plantillas', icon: LucideLayoutTemplate, route: '/templates', module: 'templates' },
  { label: 'Facturación', icon: LucideReceiptText, route: '/billing', module: 'billing' },
  {
    label: 'Clientes',
    icon: LucideBuilding2,
    route: '/customers',
    module: 'customers',
    children: [
      { label: 'Todos', route: '/customers', exact: true },
      { label: 'Leads', route: '/customers/leads' },
      { label: 'Lista negra', route: '/customers/blacklist' },
      { label: 'Equipos', route: '/equipment' },
    ],
  },
  { label: 'Contratos', icon: LucideScrollText, route: '/contracts', module: 'contracts' },
  { label: 'Marca', icon: LucidePalette, route: '/branding', module: 'branding' },
  {
    label: 'CMS',
    icon: LucideNewspaper,
    route: '/cms',
    module: 'cms',
    children: [
      { label: 'Contenido', route: '/cms/home' },
      { label: 'Clientes', route: '/cms/clients' },
    ],
  },
  { label: 'Almacén', icon: LucideWarehouse, route: '/warehouse', module: 'wms' },
];

/** Technician nav is exactly these four entries (02 §4). */
const TECH_NAV: NavEntry[] = [
  { label: 'Calendario', icon: LucideCalendarDays, route: '/calendar', module: 'calendar' },
  { label: 'Mis reportes', icon: LucideFileText, route: '/reports', module: 'reports' },
  { label: 'Mi almacén', icon: LucidePackage, route: '/warehouse', module: 'wms', exact: true },
  {
    label: 'Consulta de stock',
    icon: LucidePackageSearch,
    route: '/warehouse/stock',
    module: 'wms',
  },
];

/** Sidebar entries `(tenantConfig, role)` allow — a user never sees an entry
 *  the route guard would reject. */
export const navFor = (me: MeResponse | null): NavEntry[] =>
  (me?.role === 'technician' ? TECH_NAV : NAV).filter((e) => canAccess(me, e.module));
