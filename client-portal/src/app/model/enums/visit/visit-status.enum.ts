/** Visit lifecycle — mirrors the backend `VisitStatus`. The portal only ever
 *  receives `scheduled`/`in_progress`/`completed`: a `closed` visit was never
 *  served and its successor row is shown instead (04 §6). Kept whole for
 *  wire-type fidelity. */
export enum VisitStatus {
  Scheduled = 'scheduled',
  InProgress = 'in_progress',
  Completed = 'completed',
  Closed = 'closed',
}
