/** Lifecycle of a scheduled visit (12 §1, immutable-record model). Values are
 *  byte-identical to the backend's `VisitStatus`.
 *
 *  Two states are open, for different reasons. `scheduled` accepts the full
 *  correction — date, duration, title, notes — plus reassignment. `in_progress`
 *  (2026-07-31) accepts **only** reassignment: a technician is physically on the
 *  job, so moving its date is nonsense, but a mid-job handoff is real. Both
 *  other states are terminal — "moving" a visit that couldn't be served is close
 *  + reschedule, a new linked record — and the one edit that reaches past them
 *  is the admin-tier actuals correction. */
export enum VisitStatus {
  Scheduled = 'scheduled',
  InProgress = 'in_progress',
  Completed = 'completed',
  Closed = 'closed',
}
