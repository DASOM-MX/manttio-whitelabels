import {
  LucideBriefcase,
  LucideCalendarDays,
  LucideFileText,
  LucideHeartHandshake,
  LucideNewspaper,
  LucidePackage,
  LucidePackageSearch,
  LucideTag,
} from '@lucide/angular';
import type { NavEntry } from '../../../data/types/access/nav-entry.type';

/** Owner/admin/office nav — three groups (owner regroup 2026-07-22,
 *  supersedes the 02 §4 flat list): Negocio · CRM · CMS. Children carry
 *  their own module gates (mixed-module groups); office loses entries via
 *  the matrix as before. Panel, Facturación, Almacén and the Leads preset left
 *  the nav — their routes stay reachable by URL.
 *
 *  **Calendario returned 2026-08-03 with 12 CP-2**, which supersedes its removal
 *  in that regroup: the calendar had no page worth linking to then. Now it is
 *  where office actually schedules, and the one surface staff open daily is not
 *  a URL people are expected to remember. */
export const NAV: NavEntry[] = [
  {
    label: 'Negocio',
    icon: LucideBriefcase,
    route: '/branding',
    children: [
      { label: 'Marca', route: '/branding', module: 'branding' },
      { label: 'Usuarios', route: '/users', module: 'users' },
      { label: 'Servicios', route: '/services', module: 'services' },
      { label: 'Plantillas', route: '/templates', module: 'templates' },
    ],
  },
  {
    label: 'Operaciones',
    icon: LucideHeartHandshake,
    route: '/customers',
    children: [
      { label: 'Cotizaciones', route: '/quotations', module: 'quotations' },
      { label: 'Órdenes', route: '/service-orders', module: 'service-orders' },
      { label: 'Calendario', route: '/calendar', module: 'calendar' },
      { label: 'Reportes', route: '/reports', module: 'reports' },
    ],
  },
  {
    label: 'CRM',
    icon: LucideHeartHandshake,
    route: '/customers',
    children: [
      { label: 'Dashboard', route: '/customers/dashboard', module: 'customers' },
      { label: 'Clientes', route: '/customers', exact: true, module: 'customers' },
      { label: 'Equipos', route: '/equipment', module: 'equipment' },
      { label: 'Contratos', route: '/contracts', module: 'contracts' },
      { label: 'Lista negra', route: '/customers/blacklist', module: 'customers' },
      // "Archivados" = the Disabled status preset (no archived status exists;
      // soft-deleted rows are audit-only and never listed).
      { label: 'Archivados', route: '/customers/archived', module: 'customers' },
    ],
  },
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
];

/** Technician nav (02 §4 — the 2026-07-22 regroup left it alone; "Servicios"
 *  joined 2026-07-25 when the catalog became read-wide, 18 §2). Technicians
 *  read it as a price list: no create button, no row actions, and the API
 *  withholds each service's internal cost. */
export const TECH_NAV: NavEntry[] = [
  { label: 'Calendario', icon: LucideCalendarDays, route: '/calendar', module: 'calendar' },
  { label: 'Mis reportes', icon: LucideFileText, route: '/reports', module: 'reports' },
  { label: 'Servicios', icon: LucideTag, route: '/services', module: 'services' },
  { label: 'Mi almacén', icon: LucidePackage, route: '/warehouse', module: 'wms', exact: true },
  {
    label: 'Consulta de stock',
    icon: LucidePackageSearch,
    route: '/warehouse/stock',
    module: 'wms',
  },
];
