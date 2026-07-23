export enum VisitStatus {
  Scheduled = 'scheduled',
  Completed = 'completed',
  Cancelled = 'cancelled',
  Missed = 'missed',
  // Terminal: only reachable through POST /visits/:id/reschedule (close + reopen).
  Rescheduled = 'rescheduled',
}

// Every visit mutation is audited (12 §1, 2026-07-23): the append-only
// `visit_events` log records what happened, by whom, when. `assigned` events
// carry typed from/to technician columns (clean name joins); the rest describe
// the change through the `changes` diff + `note`.
export enum VisitEventType {
  Created = 'created',
  Updated = 'updated',
  Assigned = 'assigned',
  StatusChanged = 'status_changed',
  Rescheduled = 'rescheduled',
}
