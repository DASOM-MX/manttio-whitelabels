/** The lifecycle event types the live visit stream forwards (12 CP-4). Values
 *  are byte-identical to the backend's `visit_*` order-timeline event slugs —
 *  the stream forwards timeline rows, so its vocabulary is the timeline's. */
export enum VisitStreamKind {
  Created = 'visit_created',
  Reassigned = 'visit_reassigned',
  Corrected = 'visit_corrected',
  Started = 'visit_started',
  Completed = 'visit_completed',
  Closed = 'visit_closed',
  Rescheduled = 'visit_rescheduled',
  ActualsCorrected = 'visit_actuals_corrected',
}
