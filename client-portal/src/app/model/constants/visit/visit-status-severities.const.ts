import { VisitStatus } from '../../enums/visit/visit-status.enum';

/** p-tag severities per visit status — pills always pair color with a label. */
export const VISIT_STATUS_SEVERITIES: Record<
  VisitStatus,
  'info' | 'warn' | 'success' | 'contrast'
> = {
  [VisitStatus.Scheduled]: 'info',
  [VisitStatus.InProgress]: 'warn',
  [VisitStatus.Completed]: 'success',
  [VisitStatus.Closed]: 'contrast',
};
