// Thrown when a create references a customer, service or technician that isn't
// a live row (19 §2). The payload is well-formed and the uuid is a uuid — it
// just points at nothing — so the controller maps it to 422, not 400.
export class InvalidOrderReferenceError extends Error {
  constructor(entity: 'customer' | 'service' | 'technician', id: string) {
    super(`invalid ${entity} reference: ${id}`);
    this.name = 'InvalidOrderReferenceError';
  }
}

// Thrown when completing or cancelling an order that is already closed (19 §2).
// The request is legal; the order's state is what refuses it. Maps to 409.
export class InvalidOrderTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`invalid order transition '${from}' -> '${to}'`);
    this.name = 'InvalidOrderTransitionError';
  }
}

// Thrown when office edits `location` (19 §3) — it may edit `comments` on the
// same PATCH, but not where the crew gets sent. Maps to 403.
export class LocationEditForbiddenError extends Error {
  constructor() {
    super('editing the service location requires the owner or admin role');
    this.name = 'LocationEditForbiddenError';
  }
}

// Thrown when office posts the `open` status target (CP-2b): reopening a
// completed order is the owner/admin safety valve for a fat-fingered
// Completar, not a back-office flow. Maps to 403.
export class ReopenForbiddenError extends Error {
  constructor() {
    super('reopening a completed order requires the owner or admin role');
    this.name = 'ReopenForbiddenError';
  }
}

// Thrown when a PATCH lands on a completed/cancelled order (decided
// 2026-07-29): the mutable pair is mutable only while the order is open — a
// closed order is history, and the handoff document has already composed from
// it. Maps to 409, same family as the status-transition refusal.
export class OrderClosedError extends Error {
  constructor(public status: string) {
    super(`order is ${status}; comments and location are editable only while it is open`);
    this.name = 'OrderClosedError';
  }
}

// Thrown when an assignment references a template that doesn't exist or is not
// active (§3.5). Assignment is an admin-tier authoring action, so validation
// belongs here, never at sync time. Maps to 400.
export class InvalidTemplateError extends Error {
  constructor(id: string) {
    super(`invalid or inactive template: ${id}`);
    this.name = 'InvalidTemplateError';
  }
}
