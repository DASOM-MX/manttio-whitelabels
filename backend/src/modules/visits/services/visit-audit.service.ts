import type { DbOrTx } from '../../database/client';
import { appendOrderEvent } from '../../service-orders/repository/service-order-events.repository';
import {
  ServiceOrderEventRefKind,
  ServiceOrderEventType,
} from '../../service-orders/enums/service-orders.enum';
import { VisitEventType } from '../enums/visits.enum';
import type { VisitAuditEntry } from '../types/visit-audit.types';

// Visits have **no audit table of their own** — that was the mistake in the
// closed PR #97, and the pivot deliberately reversed it (12 §1). Every visit
// lifecycle event lands on the parent service order's single append-only
// timeline (19 §7), so the whole job history — order, lines, reports, visits —
// hands off to the client as one document at service end.

/** Maps the visits module's vocabulary onto the order timeline's. The string
 *  values coincide, but going through an explicit table keeps the two enums
 *  independently evolvable and makes an unmapped member a compile error rather
 *  than a silently mistyped event. */
const ORDER_EVENT_TYPE: Record<VisitEventType, ServiceOrderEventType> = {
  [VisitEventType.Created]: ServiceOrderEventType.VisitCreated,
  [VisitEventType.Reassigned]: ServiceOrderEventType.VisitReassigned,
  [VisitEventType.Corrected]: ServiceOrderEventType.VisitCorrected,
  [VisitEventType.Completed]: ServiceOrderEventType.VisitCompleted,
  [VisitEventType.Closed]: ServiceOrderEventType.VisitClosed,
  [VisitEventType.Rescheduled]: ServiceOrderEventType.VisitRescheduled,
};

/** Append a visit event to its parent order's timeline.
 *
 *  Takes `DbOrTx` and every caller hands in the transaction of the state change
 *  it is describing, so the event and the change commit or roll back together
 *  (19 §7). A trail that can be committed separately is a trail that can lie. */
export const appendVisitEvent = async (
  db: DbOrTx,
  entry: VisitAuditEntry,
): Promise<void> => {
  // An unbound visit has no timeline. Skipping is the honest outcome while
  // `serviceOrderId` is still optional — the alternative would be inventing a
  // visit-local event log, which is exactly what the pivot removed. Once the
  // column becomes NOT NULL this guard is dead code and comes out.
  if (!entry.serviceOrderId) return;
  await appendOrderEvent(db, {
    serviceOrderId: entry.serviceOrderId,
    type: ORDER_EVENT_TYPE[entry.type],
    actorId: entry.actorId,
    refKind: ServiceOrderEventRefKind.Visit,
    refId: entry.visitId,
    changes: entry.changes ?? null,
    note: entry.note ?? null,
  });
};
