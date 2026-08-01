import { VisitStatus } from '../../enums/visit/visit-status.enum';

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  [VisitStatus.Scheduled]: 'Programada',
  [VisitStatus.Completed]: 'Realizada',
  [VisitStatus.Closed]: 'Cerrada',
};
