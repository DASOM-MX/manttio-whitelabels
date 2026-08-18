/** Scheduled-visit DTOs (12 §1) — interfaces only; the enums live under
 *  `model/enums/visit/`. A visit is an IMMUTABLE record: while `scheduled`,
 *  office may correct its scheduling fields and reassign the technician; once
 *  `in_progress` only the reassignment survives; once terminal the sole edit is
 *  the admin-tier actuals correction. Datetimes are ISO-8601 instants (a visit
 *  happens at a moment, unlike the calendar-date fields elsewhere); every
 *  lifecycle action audits to the parent service order's timeline (19 §7),
 *  never to the visit. */

import type { ServiceOrderPriority } from '../../model/enums/service-order/service-order-priority.enum';
import type { VisitCloseReason } from '../../model/enums/visit/visit-close-reason.enum';
import type { VisitStatus } from '../../model/enums/visit/visit-status.enum';
import type { VisitStreamKind } from '../../model/enums/visit/visit-stream-kind.enum';

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
  /** `V-YYYYMMDD-NNNN`, backend-minted and immutable — the human handle people
   *  read out, write on a slip and paste into the calendar's search. */
  internalCode: string;
  customerId: string;
  customerName?: string;
  /** Present on every visit the UI creates (order-bound, 19 §1); optional only
   *  because the transition-era API still allows unbound rows. */
  serviceOrderId?: string;
  /** The parent order's display folio — the block names its job without a
   *  second fetch. */
  serviceOrderFolio?: string;
  /** The parent order's dispatch priority — a visit inherits urgency from the
   *  order it serves. Drives the block's priority border and the hover card's
   *  Prioridad row. */
  serviceOrderPriority?: ServiceOrderPriority;
  technicianId?: string;
  technicianName?: string;
  equipment: VisitEquipmentLink[];

  // --- PLANNED: what office booked ---
  scheduledStart: string;
  /** Derived by the backend from `scheduledStart + expectedDurationMinutes` and
   *  written with it, so the two can never disagree — never sent by a caller.
   *  Optional because visits booked before CP-1b have none. */
  scheduledEnd?: string;
  /** The planned length. Required with a 60-minute default: the calendar draws a
   *  visit as a block and a block needs a height. */
  expectedDurationMinutes: number;

  // --- ACTUAL: what happened (12 §1, owner 2026-07-31) ---
  /** Stamped by the field app's Iniciar; absent until a technician starts. */
  actualStart?: string;
  /** Stamped by Terminar; absent when office completed the visit from the admin,
   *  which has no tap to report. */
  actualEnd?: string;
  /** Recomputed by the backend from the pair, so plan-vs-actual reads without
   *  the client doing date arithmetic. */
  actualDurationMinutes?: number;

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

/** The read is narrowed by **either** a bounded window (`from` + `to`, the
 *  calendar's viewport) **or** an `internalCode` prefix — the API refuses an
 *  unbounded scan and 400s when neither is supplied. Two shapes rather than one:
 *  the calendar asks for a week, the search box asks for a code, and a code
 *  search that had to guess the week first would not be a search.
 *  `technicianId` takes a user id or the `'unassigned'` backlog sentinel. */
export interface VisitListQuery {
  from?: string;
  to?: string;
  /** Prefix, not fragment: `V-2026` narrows to a year, a whole code finds the
   *  one visit. Letters, digits and hyphens only — the API rejects the rest. */
  internalCode?: string;
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
  /** Always sent — the dialog's field is required and pre-filled at 60. */
  expectedDurationMinutes: number;
  title?: string;
  notes?: string;
}

/** Open-visit correction — scheduling fields plus the equipment links (12 §4;
 *  links correctable since 2026-08-06). `null` clears an optional field;
 *  omitting a key leaves it untouched. `equipmentIds` is the full replacement
 *  set, validated against the visit's customer server-side. Reassignment is its
 *  own endpoint, and `scheduledEnd` is absent because it is derived: correcting
 *  the duration is what moves the end. */
export interface CorrectVisitRequest {
  scheduledStart?: string;
  expectedDurationMinutes?: number;
  title?: string | null;
  notes?: string | null;
  equipmentIds?: string[];
}

/** `null` unassigns — back to the backlog lane. */
export interface AssignVisitRequest {
  technicianId: string | null;
}

/** Responder from the admin. Deliberately carries no `actualEnd`: office marking
 *  a visit served has no tap to report, and inventing a stamp would fabricate
 *  billing data. The field app's Terminar sends one (CP-3, `frontend/`). */
export interface RespondVisitRequest {
  /** Report folio, when the served visit already has its report. */
  reportId?: string;
}

/** Fixing a mis-tapped or mis-synced stamp on a terminal visit — owner/admin
 *  only (12 §2). Neither field is nullable: this repairs a time, it never erases
 *  one, and the correction appends its own event to the order timeline. */
export interface CorrectVisitActualsRequest {
  actualStart?: string;
  actualEnd?: string;
}

export interface CloseVisitRequest {
  reason: VisitCloseReason;
  /** Required when `reason` is `other`. */
  note?: string;
}

/** The successor of a closed visit. `technicianId` omitted = inherit the
 *  closed visit's assignee; explicit `null` sends it to the backlog.
 *  `expectedDurationMinutes` omitted likewise inherits — the same job on a new
 *  date takes the same time unless told otherwise. */
export interface RescheduleVisitRequest {
  scheduledStart: string;
  expectedDurationMinutes?: number;
  technicianId?: string | null;
}

/** One `visit` frame off `GET /visits/stream` (12 CP-4): which lifecycle
 *  event fired, and the visit as it now reads — the same flattened DTO the
 *  single-visit GET returns, so a consumer upserts by id without a second
 *  read. */
export interface VisitStreamFrame {
  kind: VisitStreamKind;
  visit: Visit;
}
