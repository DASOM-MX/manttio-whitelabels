/** Scheduled-visit DTOs (12 §1) — interfaces only; the enums live under
 *  `model/enums/visit/`. A visit is an IMMUTABLE record: while `scheduled`,
 *  office may correct its scheduling fields and reassign the technician —
 *  nothing else, ever. Datetimes are ISO-8601 instants (a visit happens at a
 *  moment, unlike the calendar-date fields elsewhere); every lifecycle action
 *  audits to the parent service order's timeline (19 §7), never to the visit. */

import type { VisitCloseReason } from '../../model/enums/visit/visit-close-reason.enum';
import type { VisitStatus } from '../../model/enums/visit/visit-status.enum';

/** One linked unit, flattened for display. */
export interface VisitEquipmentLink {
  id: string;
  name?: string | null;
}

/** The order a visit hangs from, as the visit dialog needs it — enough to
 *  lock the selection (order view's "Programar visita") and to derive the
 *  client without a second read. */
export interface VisitOrderContext {
  id: string;
  folio: string;
  customerId: string;
  customerName: string;
}

export interface Visit {
  id: string;
  customerId: string;
  customerName?: string;
  /** Present on every visit the UI creates (order-bound, 19 §1); optional only
   *  because the transition-era API still allows unbound rows. */
  serviceOrderId?: string;
  /** The parent order's display folio — the chip names its job without a
   *  second fetch. */
  serviceOrderFolio?: string;
  technicianId?: string;
  technicianName?: string;
  equipment: VisitEquipmentLink[];
  scheduledStart: string;
  scheduledEnd?: string;
  status: VisitStatus;
  closeReason?: VisitCloseReason;
  closeNote?: string;
  /** The closed visit this one replaces. */
  rescheduledFromId?: string;
  /** The successor a closed visit was rescheduled into — resolved on the
   *  single-visit read only. */
  rescheduledToId?: string;
  reportId?: string;
  title?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** The calendar always reads a bounded window — `from`/`to` are required.
 *  `technicianId` takes a user id or the `'unassigned'` backlog sentinel. */
export interface VisitListQuery {
  from: string;
  to: string;
  technicianId?: string;
  customerId?: string;
  status?: VisitStatus;
}

export interface CreateVisitRequest {
  customerId: string;
  /** Required by the UI (visits are order-bound, 19 §1); the API still types
   *  it optional during the transition. */
  serviceOrderId: string;
  /** Omitted = unassigned (the backlog lane). */
  technicianId?: string;
  equipmentIds?: string[];
  scheduledStart: string;
  scheduledEnd?: string;
  title?: string;
  notes?: string;
}

/** Open-visit correction — scheduling fields only (12 §4). `null` clears an
 *  optional field; omitting a key leaves it untouched. Reassignment is its own
 *  endpoint. */
export interface CorrectVisitRequest {
  scheduledStart?: string;
  scheduledEnd?: string | null;
  title?: string | null;
  notes?: string | null;
}

/** `null` unassigns — back to the backlog lane. */
export interface AssignVisitRequest {
  technicianId: string | null;
}

export interface RespondVisitRequest {
  /** Report folio, when the served visit already has its report. */
  reportId?: string;
}

export interface CloseVisitRequest {
  reason: VisitCloseReason;
  /** Required when `reason` is `other`. */
  note?: string;
}

/** The successor of a closed visit. `technicianId` omitted = inherit the
 *  closed visit's assignee; explicit `null` sends it to the backlog. */
export interface RescheduleVisitRequest {
  scheduledStart: string;
  scheduledEnd?: string;
  technicianId?: string | null;
}
