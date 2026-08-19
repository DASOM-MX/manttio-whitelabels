import type { VisitStatus } from '../enums/visits.enum';

/** A visit is immutable once it goes terminal (12 §1). Reassignment, start,
 *  respond and close all require an **open** state (`scheduled` or, since
 *  2026-07-31, `in_progress`), so acting on a completed or closed record is a
 *  conflict — the request is well-formed, the record has simply moved on.
 *  Controller maps it to `409 visit_not_open`. */
export class VisitNotOpenError extends Error {
  constructor(public status: VisitStatus) {
    super(`visit is not open: ${status}`);
    this.name = 'VisitNotOpenError';
  }
}

/** Scheduling correction is narrower than "open" (owner, 2026-07-31): it needs
 *  the visit to still be `scheduled`. Moving the date of a job a technician is
 *  physically performing is nonsense, so `in_progress` refuses it — while
 *  reassignment deliberately stays available there, because a mid-job handoff
 *  is real. Controller maps it to `409 visit_not_correctable`. */
export class VisitNotCorrectableError extends Error {
  constructor(public status: VisitStatus) {
    super(`visit can no longer be corrected: ${status}`);
    this.name = 'VisitNotCorrectableError';
  }
}

/** Iniciar starts a visit that has not started yet. Asking for it on an
 *  `in_progress` visit means someone already tapped it (a duplicate offline
 *  queue entry, most likely), and on a terminal one the job is over.
 *  Controller maps it to `409 visit_not_startable`. */
export class VisitNotStartableError extends Error {
  constructor(public status: VisitStatus) {
    super(`visit cannot be started: ${status}`);
    this.name = 'VisitNotStartableError';
  }
}

/** The actuals correction is the one edit that reaches past a terminal state
 *  (12 §1) — which means it *requires* one. There is nothing to correct on a
 *  visit whose technician has not finished it; the honest fix there is to let
 *  Terminar record the real time. Controller maps it to
 *  `409 visit_not_terminal`. */
export class VisitNotTerminalError extends Error {
  constructor(public status: VisitStatus) {
    super(`visit is not terminal: ${status}`);
    this.name = 'VisitNotTerminalError';
  }
}

/** A client-supplied actual timestamp that cannot be true (12 §5). The stamps
 *  are *trusted* — the field app records the tap, not the sync — but trusted is
 *  not unchecked: a time in the future or before the visit existed is a broken
 *  device clock or a mangled queue entry, and letting it through would bill a
 *  job that never took that long. Controller maps it to
 *  `400 invalid_actual_time`. */
export class InvalidActualTimeError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = 'InvalidActualTimeError';
  }
}

/** Rescheduling mints the successor of a **closed** visit. Asking for one from
 *  a `scheduled` visit means the caller wanted a correction, and from a
 *  `completed` one means the job was already served — both are conflicts.
 *  Controller maps it to `409 visit_not_closed`. */
export class VisitNotClosedError extends Error {
  constructor(public status: VisitStatus) {
    super(`visit is not closed: ${status}`);
    this.name = 'VisitNotClosedError';
  }
}

/** A closed visit has at most one successor, enforced by a unique index so
 *  concurrent reschedules can't fork the chain. Controller maps it to
 *  `409 visit_already_rescheduled`. */
export class VisitAlreadyRescheduledError extends Error {
  constructor(public visitId: string) {
    super(`visit already has a rescheduled successor: ${visitId}`);
    this.name = 'VisitAlreadyRescheduledError';
  }
}

/** The technician rule (12 §2a): a technician may act on — and give away —
 *  only visits currently assigned to *them*. They can never pull a colleague's
 *  visit, respond to it, or close it. Staff (owner/admin/office) bypass this
 *  entirely. Controller maps it to `403 visit_not_yours`. */
export class VisitNotAssignedToUserError extends Error {
  constructor() {
    super('technicians may only act on their own visits');
    this.name = 'VisitNotAssignedToUserError';
  }
}

/** Equipment is scoped to a customer, so a visit can only cover units that
 *  belong to *its* customer. A mismatch is a conflict rather than a validation
 *  failure — the ids are well-formed uuids that exist, just on another client.
 *  Controller maps it to `409 equipment_customer_mismatch`. */
export class EquipmentCustomerMismatchError extends Error {
  constructor(public equipmentIds: string[]) {
    super(`equipment does not belong to this customer: ${equipmentIds.join(', ')}`);
    this.name = 'EquipmentCustomerMismatchError';
  }
}

/** Same rule for the report linked on respond: it must be the same client's.
 *  Controller maps it to `409 report_customer_mismatch`. */
export class ReportCustomerMismatchError extends Error {
  constructor(public reportId: string) {
    super(`report does not belong to this customer: ${reportId}`);
    this.name = 'ReportCustomerMismatchError';
  }
}

/** The visit vanished (soft-deleted) between a read and the write that followed
 *  it. Only reachable on a lost race — the ordinary missing-visit path returns
 *  null and the controller answers 404 without an exception. Controller maps it
 *  to `404 not_found`. */
export class VisitNotFoundError extends Error {
  constructor(public visitId: string) {
    super(`visit not found: ${visitId}`);
    this.name = 'VisitNotFoundError';
  }
}

/** A visit was written and committed, and then could not be read back to build
 *  the response. Both creation paths — `createVisit` and the successor minted by
 *  `rescheduleVisit` — assert this, because `null` from a visits service means
 *  "the visit you named does not exist" and the controller turns that into a
 *  404. Answering a committed write with `not_found` would be a lie, and on the
 *  reschedule path it would name the *source* visit for a fault in the new one.
 *
 *  **Deliberately unmapped in `visits.error-response.ts`.** Every other class
 *  here is a rule the request broke; this one is the module's own invariant
 *  breaking, so it falls through to the global handler as a `500` and gets
 *  logged. Mapping it would turn a bug into a tidy response and hide it. */
export class VisitReadBackFailedError extends Error {
  constructor(
    public visitId: string,
    public operation: string,
  ) {
    super(`${operation}: committed visit ${visitId} could not be read back`);
    this.name = 'VisitReadBackFailedError';
  }
}

/** The parent order must exist and be live. Controller maps it to
 *  `400 service_order_not_found`. */
export class VisitServiceOrderNotFoundError extends Error {
  constructor(public serviceOrderId: string) {
    super(`service order not found: ${serviceOrderId}`);
    this.name = 'VisitServiceOrderNotFoundError';
  }
}

/** Work is only scheduled against an **open** order (19 §1): a completed order
 *  is done and a cancelled one closes its scheduled visits, so adding a visit
 *  to either contradicts the state that was already handed to the client.
 *  Controller maps it to `409 service_order_not_open`. */
export class ServiceOrderNotOpenError extends Error {
  constructor(public status: string) {
    super(`service order is not open: ${status}`);
    this.name = 'ServiceOrderNotOpenError';
  }
}

/** The supplied client and the order's client disagree. Silently preferring
 *  either one would schedule a job for the wrong party, so this is a hard stop.
 *  Controller maps it to `409 order_customer_mismatch`. */
export class OrderCustomerMismatchError extends Error {
  constructor(
    public serviceOrderId: string,
    public customerId: string,
  ) {
    super(`order ${serviceOrderId} does not belong to customer ${customerId}`);
    this.name = 'OrderCustomerMismatchError';
  }
}

/** The visit's customer must exist and be live. Checked up front so a bad id
 *  is a clean 400 rather than an FK violation surfacing as a 500. Controller
 *  maps it to `400 customer_not_found`. */
export class VisitCustomerNotFoundError extends Error {
  constructor(public customerId: string) {
    super(`customer not found: ${customerId}`);
    this.name = 'VisitCustomerNotFoundError';
  }
}

/** The assignee must be a live user. A dangling or tombstoned id would
 *  otherwise reach the FK and surface as a 500. Controller maps it to
 *  `400 technician_not_found`. */
export class TechnicianNotFoundError extends Error {
  constructor(public technicianId: string) {
    super(`technician not found: ${technicianId}`);
    this.name = 'TechnicianNotFoundError';
  }
}
