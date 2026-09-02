import {
  LucideBoxes,
  LucideFileSignature,
  LucideFileText,
  LucideHome,
  LucideMessageSquarePlus,
  LucideReceipt,
  LucideReceiptText,
  LucideWrench,
} from '@lucide/angular';
import { PortalGrant } from '../../enums/portal-auth/portal-grants.enum';
import type { PortalNavEntry } from '../../../data/types/nav/portal-nav-entry.type';

/** Portal sidebar — a flat list (00 §4/03 §4): no groups, no nesting. Inicio
 *  carries no `grant` and always renders; every other routed row hides
 *  unless the matching grant is in `/portal/auth/me`. Facturas (00 §4b.24)
 *  carries neither `route` nor `grant` and always renders too — it is the
 *  one row that is not a route. */
export const PORTAL_NAV: PortalNavEntry[] = [
  { label: 'Inicio', icon: LucideHome, route: '/home', exact: true },
  { label: 'Reportes', icon: LucideFileText, route: '/reports', grant: PortalGrant.ViewReports },
  {
    label: 'Contratos',
    icon: LucideFileSignature,
    route: '/contracts',
    grant: PortalGrant.ViewContracts,
  },
  {
    label: 'Cotizaciones',
    icon: LucideReceipt,
    route: '/quotations',
    grant: PortalGrant.ViewQuotations,
  },
  {
    label: 'Órdenes de servicio',
    icon: LucideWrench,
    route: '/service-orders',
    grant: PortalGrant.ViewServiceOrders,
  },
  { label: 'Equipos', icon: LucideBoxes, route: '/equipment', grant: PortalGrant.ViewEquipment },
  {
    label: 'Solicitudes',
    icon: LucideMessageSquarePlus,
    route: '/service-requests',
    grant: PortalGrant.CreateServiceRequests,
  },
  { label: 'Facturas', icon: LucideReceiptText, disabledLabel: 'Próximamente' },
];
