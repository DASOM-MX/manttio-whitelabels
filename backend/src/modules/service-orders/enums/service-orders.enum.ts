// Service-order domain enums (19 §1/§7). String-valued TS enums, the preferred
// shape for new modules — call sites read `status === ServiceOrderStatus.Open`
// and the DB columns are typed via `.$type<>()`. Validator-enforced, no CHECK
// constraints: the Drizzle model stays the single source of truth.

/** Order lifecycle (19 §1). Manual in v1 — the auto-complete-when-all-reports-
 *  finish rule is still an open decision (19 open decisions). `completed` is
 *  what triggers the client handoff document (CP-5). */
export enum ServiceOrderStatus {
  Open = 'open',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

/** Dispatch priority (CP-2b; widened 2026-07-31 from the original two-level
 *  flag to this five-step ladder — owner call, ClickUp-style scale). Ranked
 *  low → urgent; `normal` stays the birth default, and the column carries no
 *  CHECK, so the widening is validator-only — no DDL. Any staff may move it
 *  while the order is open. */
export enum ServiceOrderPriority {
  Low = 'low',
  Normal = 'normal',
  Medium = 'medium',
  High = 'high',
  Urgent = 'urgent',
}

/** Every event that lands on the order timeline (19 §7). The service order is
 *  the **single audit aggregate**: lines, reports and (from CP-3) visits all
 *  append here rather than to per-child audit tables.
 *
 *  The `visit_*` members ship complete in CP-1 but have **no writer yet**
 *  (decided 2026-07-26): the visits backend never landed on main (PR #97 was
 *  closed unmerged), so 12's rebuild in CP-3 is what starts emitting them. The
 *  enum is final from day one so that rebuild adds a caller, not a schema
 *  change. */
export enum ServiceOrderEventType {
  // --- Order itself ---
  OrderCreated = 'order_created',
  OrderLineAdded = 'order_line_added',
  OrderCommentUpdated = 'order_comment_updated',
  OrderLocationChanged = 'order_location_changed',
  /** The dispatch flags (CP-2b) — logistics metadata edits, same family as
   *  comments/location. TS-only additions: the events table has no type CHECK. */
  OrderPriorityChanged = 'order_priority_changed',
  OrderPromiseChanged = 'order_promise_changed',
  /** Non-terminal transitions — since CP-2b, the owner/admin reopen
   *  (`completed → open`), exactly what this member was reserved for. The two
   *  terminal moves emit `OrderCompleted`/`OrderCancelled` instead — they carry
   *  the same `changes.status` diff, and double-logging both would only make
   *  the handoff document noisier. */
  OrderStatusChanged = 'order_status_changed',
  OrderCompleted = 'order_completed',
  OrderCancelled = 'order_cancelled',
  /** refId → the generated contract (13). Written by `POST /contracts`. */
  OrderContractGenerated = 'order_contract_generated',
  /** refId → the `service_order_emails` row (CP-5 handoff delivery). */
  OrderMailed = 'order_mailed',

  // --- Visits (12, CP-3) — logged here, never on the visit ---
  VisitCreated = 'visit_created',
  VisitReassigned = 'visit_reassigned',
  VisitCorrected = 'visit_corrected',
  VisitCompleted = 'visit_completed',
  /** note = close category + reason. */
  VisitClosed = 'visit_closed',
  /** refId → the successor visit (visits are immutable records). */
  VisitRescheduled = 'visit_rescheduled',

  // --- Reports (06) ---
  ReportExploded = 'report_exploded',
  ReportStatusChanged = 'report_status_changed',
  ReportFinished = 'report_finished',
}

/** What an event's `refId` points at (19 §7). `refId` is stored as text because
 *  the children don't share a key type — report ids are `R-YYYYMMDD-NNNN`
 *  folios while visits, lines, contracts and emails are uuids. */
export enum ServiceOrderEventRefKind {
  Visit = 'visit',
  Report = 'report',
  Line = 'line',
  Email = 'email',
  /** Not in the plan's original list, but `order_contract_generated` is defined
   *  as "refId → contract" (19 §7) — it needs a kind to resolve against. */
  Contract = 'contract',
  /** The accepted quotation an order was born from — carried by the opening
   *  `order_created` event on converted orders (20 §6). */
  Quotation = 'quotation',
}
