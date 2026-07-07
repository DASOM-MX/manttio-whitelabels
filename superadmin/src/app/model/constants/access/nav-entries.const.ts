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
import type { NavEntry } from '../../../access';

/** Full nav, owner/admin shape (02 §4); office loses entries via the matrix. */
export const NAV: NavEntry[] = [
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
      { label: 'Home', route: '/cms/home' },
      { label: 'Clientes', route: '/cms/clients' },
    ],
  },
  { label: 'Almacén', icon: LucideWarehouse, route: '/warehouse', module: 'wms' },
];

/** Technician nav is exactly these four entries (02 §4). */
export const TECH_NAV: NavEntry[] = [
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
