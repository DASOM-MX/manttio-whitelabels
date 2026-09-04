import { PortalGrant } from '../../enums/portal-user/portal-grant.enum';

/** One-line Spanish explanation per grant (26 §3) — shared by the invite
 *  dialog and the standalone grants editor. Equipos and the request grants
 *  say plainly that they are independent (owner, 2026-08-31): ticking one
 *  never ticks the other. The Consultar cotizaciones ↔ Aprobar cotizaciones
 *  dependency note is appended live by `PortalGrantsFieldset`, not here —
 *  it only applies while Aprobar cotizaciones is checked. */
export const PORTAL_GRANT_HELPER_TEXT: Record<PortalGrant, string> = {
  [PortalGrant.ViewReports]: 'Consultar los reportes de servicio del cliente.',
  [PortalGrant.ViewContracts]: 'Consultar los contratos vigentes del cliente.',
  [PortalGrant.ViewQuotations]: 'Consultar cotizaciones enviadas.',
  [PortalGrant.ViewServiceOrders]: 'Consultar el estado de las órdenes de servicio.',
  [PortalGrant.ViewEquipment]:
    'Abre el catálogo de equipos instalados. Independiente de Crear solicitudes: quien solicita servicio ya tiene un buscador de equipos dentro del formulario, aunque no tenga este permiso.',
  [PortalGrant.ApproveQuotations]:
    'Aprobar o rechazar cotizaciones. Requiere Consultar cotizaciones — se marca junto con este permiso, porque no tiene sentido aprobar algo que no se puede leer.',
  [PortalGrant.CreateServiceRequests]:
    'Abre el formulario para solicitar servicio, con su propio buscador de equipos.',
  [PortalGrant.CancelServiceRequests]:
    'Retirar solicitudes que ya están en manos del personal. Independiente de poder crearlas.',
};
