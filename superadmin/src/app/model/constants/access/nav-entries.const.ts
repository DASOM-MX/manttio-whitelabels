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
 *  the matrix as before. Panel, Calendario, Facturación, Almacén, and the
 *  Leads preset left the nav — their routes stay reachable by URL. */
export const NAV: NavEntry[] = [
  {
    label: 'Negocio',
    icon: LucideBriefcase,
    route: '/branding',
    children: [
      { label: 'Marca', route: '/branding', module: 'branding' },
      { label: 'Usuarios', route: '/users', module: 'users' },
      { label: 'Servicios', route: '/services', module: 'services' },
      { label: 'Reportes', route: '/reports', module: 'reports' },
      { label: 'Plantillas', route: '/templates', module: 'templates' },
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
