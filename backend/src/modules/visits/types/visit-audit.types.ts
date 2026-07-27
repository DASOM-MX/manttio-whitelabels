import type { VisitEventType } from '../enums/visits.enum';

/** The field-level diff the order timeline stores for corrections and
 *  reassignments — `{ field: { from, to } }`, matching `service_order_events.changes`
 *  (19 §7). Only fields that actually moved appear: an audit entry claiming a
 *  change that didn't happen is worse than no entry at all. */
export type VisitFieldChanges = Record<string, { from: unknown; to: unknown }>;

/** One visit lifecycle event, in the visits module's own terms.
 *  `visit-audit.service.ts` translates it into a `service_order_events` row —
 *  callers here never name the order table or its enums. */
export interface VisitAuditEntry {
  /** The parent order whose timeline receives this event. Null while visits may
   *  exist unbound — such a visit has no timeline to append to, so the write is
   *  skipped rather than redirected to some visit-local log. */
  serviceOrderId: string | null;
  type: VisitEventType;
  /** The acting user. Always present — every visit mutation has a human behind
   *  it; the order table's column is nullable only for pure-system events. */
  actorId: string;
  /** The visit this event concerns, written as `refKind: 'visit'` + `refId`. */
  visitId: string;
  changes?: VisitFieldChanges;
  /** Free text — the close category and its note, a reschedule pointer. */
  note?: string;
}
