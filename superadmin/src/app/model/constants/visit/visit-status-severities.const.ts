import { VisitStatus } from '../../enums/visit/visit-status.enum';

/** `p-tag` severity per status — the visit dialog's header pill. Typed to
 *  PrimeNG's own union so the template binding stays assignable. */
export const VISIT_STATUS_SEVERITIES: Record<VisitStatus, 'info' | 'success' | 'secondary'> = {
  [VisitStatus.Scheduled]: 'info',
  [VisitStatus.Completed]: 'success',
  [VisitStatus.Closed]: 'secondary',
};
