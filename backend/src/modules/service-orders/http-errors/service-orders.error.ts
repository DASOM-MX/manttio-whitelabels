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
