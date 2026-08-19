import type { ReportStatus } from '../../enums/report/report-status.enum';

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'Pendiente',
  created: 'Creado',
  'in-progress': 'En progreso',
  finished: 'Terminado',
  mailed: 'Enviado',
  cancelled: 'Cancelado',
};
