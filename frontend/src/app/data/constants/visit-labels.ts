import { VisitCloseReason, VisitStatus } from '../types/visit';

/** What each visit state reads on screen. */
export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  [VisitStatus.Scheduled]: 'Programada',
  [VisitStatus.InProgress]: 'En curso',
  [VisitStatus.Completed]: 'Completada',
  [VisitStatus.Closed]: 'Cerrada',
};

/** `<p-tag>` severity per state — the same temperature the reports list uses:
 *  work not yet started is informational, work happening is warm, done is
 *  green, and a close is muted rather than alarming (it is an outcome, not an
 *  error). */
export const VISIT_STATUS_SEVERITIES: Record<
  VisitStatus,
  'info' | 'warn' | 'success' | 'secondary'
> = {
  [VisitStatus.Scheduled]: 'info',
  [VisitStatus.InProgress]: 'warn',
  [VisitStatus.Completed]: 'success',
  [VisitStatus.Closed]: 'secondary',
};

export const VISIT_CLOSE_REASON_LABELS: Record<VisitCloseReason, string> = {
  [VisitCloseReason.ClientCancelled]: 'Cliente canceló',
  [VisitCloseReason.ClientAbsent]: 'Cliente ausente',
  [VisitCloseReason.NoAccess]: 'Sin acceso al sitio',
  [VisitCloseReason.TechUnavailable]: 'Técnico no disponible',
  [VisitCloseReason.Other]: 'Otro motivo',
};
