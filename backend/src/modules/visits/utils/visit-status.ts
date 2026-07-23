import { VisitStatus } from '../enums/visits.enum';

// v1 lifecycle (12-calendar §1): a scheduled visit closes to completed /
// cancelled / missed; any closed state can reopen to scheduled (mistake
// recovery). Closed states never move directly between each other.
const TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  [VisitStatus.Scheduled]: [VisitStatus.Completed, VisitStatus.Cancelled, VisitStatus.Missed],
  [VisitStatus.Completed]: [VisitStatus.Scheduled],
  [VisitStatus.Cancelled]: [VisitStatus.Scheduled],
  [VisitStatus.Missed]: [VisitStatus.Scheduled],
};

export const canTransitionVisitStatus = (from: VisitStatus, to: VisitStatus): boolean =>
  TRANSITIONS[from].includes(to);
