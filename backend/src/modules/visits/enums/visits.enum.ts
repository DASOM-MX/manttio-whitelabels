// Lifecycle of a scheduled visit (12 §1, immutable-record model decided
// 2026-07-23). A visit is a *plan*; a report (06) is what happened. `scheduled`
// is the only open state — office may correct/reassign it there and nowhere
// else. Both other states are **terminal**: once a technician acts, the record
// is frozen (no edits, no reopen). "Moving" a visit that couldn't be served is
// close + reschedule, which mints a new linked record rather than mutating this
// one.
export enum VisitStatus {
  // Booked, untouched. The only state that accepts a scheduling **correction**.
  Scheduled = 'scheduled',
  // The technician tapped Iniciar in the field app: work is happening right now
  // and `actualStart` is stamped (12 §1, owner 2026-07-31). Added deliberately
  // — it supersedes "scheduled is the only open state", because office needs to
  // see who is on site. **Frozen for planning:** a correction is refused here
  // (moving the date of a visit being performed is nonsense), but
  // **reassignment stays open** so a genuine mid-job handoff is possible.
  InProgress = 'in_progress',
  // Served. Set when the technician responds/terminates, or manually by staff;
  // carries the produced report via `reportId` when there is one.
  Completed = 'completed',
  // Not served, for a categorized reason. Terminal — the successor visit, if
  // any, is a separate row pointing back through `rescheduledFromId`.
  Closed = 'closed',
}

/** The two live states. A visit here can still be reassigned or ended; both
 *  terminal states refuse everything but an admin-tier actuals correction. */
export const OPEN_VISIT_STATUSES: VisitStatus[] = [VisitStatus.Scheduled, VisitStatus.InProgress];

/** Terminal — the only states where the actuals may be corrected (12 §1). */
export const TERMINAL_VISIT_STATUSES: VisitStatus[] = [
  VisitStatus.Completed,
  VisitStatus.Closed,
];

// Why a visit was closed (12 §1, decided 2026-07-23). A single `closed` status
// plus a required category beats one status per outcome: the reasons are
// reporting dimensions, not lifecycle states, and adding one must never widen
// the state machine.
//
// The v1 list is deliberately short and confirmable with the first tenant;
// `Other` + a note is the escape hatch, so an unforeseen reason never blocks a
// technician mid-field.
export enum VisitCloseReason {
  ClientCancelled = 'client_cancelled',
  ClientAbsent = 'client_absent',
  NoAccess = 'no_access',
  TechUnavailable = 'tech_unavailable',
  Other = 'other',
}

// What a visit contributes to the **parent service order's** activity timeline
// (19 §7). There is deliberately no visit-level event table: the whole job
// history — order, lines, reports and visits — lands in one append-only
// aggregate so it can be handed to the client at service end. (This supersedes
// the `visit_events` table on the closed PR #97.)
//
// This is the visits module's own vocabulary — what a visit declares it can
// emit — and it is deliberately narrow: a visit may never append an order- or
// report-level event. `visit-audit.service.ts` maps each member onto the
// matching `Visit*` member of 19's `ServiceOrderEventType` at write time.
//
// The string values are byte-identical to 19's on purpose, so the two stay
// legible as one vocabulary in the timeline and the mapping never has to
// translate data — only types.
export enum VisitEventType {
  Created = 'visit_created',
  Reassigned = 'visit_reassigned',
  Corrected = 'visit_corrected',
  /** Iniciar — work began; `actualStart` stamped (2026-07-31). */
  Started = 'visit_started',
  Completed = 'visit_completed',
  Closed = 'visit_closed',
  Rescheduled = 'visit_rescheduled',
  /** An owner/admin fixed a mis-tapped or mis-synced actual time on a terminal
   *  visit (2026-07-31). Carries the before/after diff — the correction is
   *  auditable precisely because the original value stays readable. */
  ActualsCorrected = 'visit_actuals_corrected',
}
