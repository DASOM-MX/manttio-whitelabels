import { VisitStatus } from '../../enums/visit/visit-status.enum';

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  [VisitStatus.Scheduled]: 'Programada',
  [VisitStatus.InProgress]: 'En curso',
  [VisitStatus.Completed]: 'Realizada',
  [VisitStatus.Closed]: 'No realizada',
};
