import { VisitStatus } from '../../enums/visit/visit-status.enum';

/** `p-tag` severity per status — the visit dialog's header pill. Typed to
 *  PrimeNG's own union so the template binding stays assignable. `in_progress`
 *  takes `warn` not because anything is wrong but because it is the one severity
 *  that reads as *live*: a job happening right now should catch the eye. */
export const VISIT_STATUS_SEVERITIES: Record<
  VisitStatus,
  'info' | 'warn' | 'success' | 'secondary'
> = {
  [VisitStatus.Scheduled]: 'info',
  [VisitStatus.InProgress]: 'warn',
  [VisitStatus.Completed]: 'success',
  [VisitStatus.Closed]: 'secondary',
};
