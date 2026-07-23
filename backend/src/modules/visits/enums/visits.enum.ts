export enum VisitStatus {
  Scheduled = 'scheduled',
  Completed = 'completed',
  Cancelled = 'cancelled',
  Missed = 'missed',
  // Terminal: only reachable through POST /visits/:id/reschedule (close + reopen).
  Rescheduled = 'rescheduled',
}
