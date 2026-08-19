/** Order timeline entry types (19 §7) — full parity with the backend
 *  `ServiceOrderEventType`. The `Visit*` members ship with CP-3's calendar;
 *  they are already in the vocabulary so the feed never meets an unknown type. */
export enum ServiceOrderEventType {
  OrderCreated = 'order_created',
  OrderLineAdded = 'order_line_added',
  OrderCommentUpdated = 'order_comment_updated',
  OrderLocationChanged = 'order_location_changed',
  OrderPriorityChanged = 'order_priority_changed',
  OrderPromiseChanged = 'order_promise_changed',
  OrderStatusChanged = 'order_status_changed',
  OrderCompleted = 'order_completed',
  OrderCancelled = 'order_cancelled',
  OrderContractGenerated = 'order_contract_generated',
  OrderMailed = 'order_mailed',
  VisitCreated = 'visit_created',
  VisitReassigned = 'visit_reassigned',
  VisitCorrected = 'visit_corrected',
  VisitCompleted = 'visit_completed',
  VisitClosed = 'visit_closed',
  VisitRescheduled = 'visit_rescheduled',
  ReportExploded = 'report_exploded',
  ReportStatusChanged = 'report_status_changed',
  ReportFinished = 'report_finished',
}
