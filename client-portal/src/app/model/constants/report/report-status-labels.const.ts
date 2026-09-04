import { ReportStatus } from '../../enums/report/report-status.enum';

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  [ReportStatus.Pending]: 'Pendiente',
  [ReportStatus.Created]: 'Creado',
  [ReportStatus.InProgress]: 'En progreso',
  [ReportStatus.Finished]: 'Terminado',
  [ReportStatus.Mailed]: 'Enviado',
  [ReportStatus.Cancelled]: 'Cancelado',
};
