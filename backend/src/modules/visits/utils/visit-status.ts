import { VisitStatus } from '../enums/visits.enum';

// v1 lifecycle (12-calendar §1): a scheduled visit closes to completed /
// cancelled / missed; any of those can reopen to scheduled (mistake recovery).
// Closed states never move directly between each other. `rescheduled` is
// reachable only through the reschedule transaction (never via /status) and is
// terminal — the chain's replacement record supersedes it.
const TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  [VisitStatus.Scheduled]: [VisitStatus.Completed, VisitStatus.Cancelled, VisitStatus.Missed],
  [VisitStatus.Completed]: [VisitStatus.Scheduled],
  [VisitStatus.Cancelled]: [VisitStatus.Scheduled],
  [VisitStatus.Missed]: [VisitStatus.Scheduled],
  [VisitStatus.Rescheduled]: [],
};

export const canTransitionVisitStatus = (from: VisitStatus, to: VisitStatus): boolean =>
  TRANSITIONS[from].includes(to);
