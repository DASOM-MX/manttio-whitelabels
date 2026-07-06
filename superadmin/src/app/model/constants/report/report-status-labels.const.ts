import type { ReportStatus } from '../../../data/dtos/report';

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  created: 'Creado',
  'in-progress': 'En progreso',
  finished: 'Terminado',
  mailed: 'Enviado',
};
