import { VisitCloseReason } from '../../enums/visit/visit-close-reason.enum';

/** Insertion order is the close dialog's select order — most common first,
 *  the `other` escape hatch last. */
export const VISIT_CLOSE_REASON_LABELS: Record<VisitCloseReason, string> = {
  [VisitCloseReason.ClientCancelled]: 'El cliente canceló',
  [VisitCloseReason.ClientAbsent]: 'El cliente no estaba',
  [VisitCloseReason.NoAccess]: 'Sin acceso al sitio',
  [VisitCloseReason.TechUnavailable]: 'Técnico no disponible',
  [VisitCloseReason.Other]: 'Otro motivo',
};
