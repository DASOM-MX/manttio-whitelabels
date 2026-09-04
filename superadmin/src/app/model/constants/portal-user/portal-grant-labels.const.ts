import { PortalGrant } from '../../enums/portal-user/portal-grant.enum';

/** Short enough for a row chip, explicit enough for the filter dropdown —
 *  the view grants read as the surface they open, the three act grants keep
 *  their verb. */
export const PORTAL_GRANT_LABELS: Record<PortalGrant, string> = {
  [PortalGrant.ViewReports]: 'Reportes',
  [PortalGrant.ViewContracts]: 'Contratos',
  [PortalGrant.ViewQuotations]: 'Cotizaciones',
  [PortalGrant.ViewServiceOrders]: 'Órdenes',
  [PortalGrant.ViewEquipment]: 'Equipos',
  [PortalGrant.ApproveQuotations]: 'Aprobar cotizaciones',
  [PortalGrant.CreateServiceRequests]: 'Crear solicitudes',
  [PortalGrant.CancelServiceRequests]: 'Cancelar solicitudes',
};
