/** Lifecycle of a scheduled visit (12 §1, immutable-record model). `scheduled`
 *  is the only open state — correction, reassignment and tech actions happen
 *  there and nowhere else. Both other states are terminal: "moving" a visit
 *  that couldn't be served is close + reschedule, a new linked record. Values
 *  are byte-identical to the backend's `VisitStatus`. */
export enum VisitStatus {
  Scheduled = 'scheduled',
  Completed = 'completed',
  Closed = 'closed',
}
