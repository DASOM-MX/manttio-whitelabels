import type { VisitStatus } from '../enums/visits.enum';

/** A visit is immutable once a technician has acted (12 §1). Correction,
 *  reassignment, respond and close all require the `scheduled` state, so acting
 *  on a terminal record is a conflict — the request is well-formed, the record
 *  has simply moved on. Controller maps it to `409 visit_not_open`. */
export class VisitNotOpenError extends Error {
  constructor(public status: VisitStatus) {
    super(`visit is not open: ${status}`);
    this.name = 'VisitNotOpenError';
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
