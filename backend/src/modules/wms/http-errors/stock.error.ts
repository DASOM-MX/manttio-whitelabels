// Stock-operation domain errors (10-wms/02 §4/§9). Thrown in
// `services/stock.service.ts`, mapped to a status in
// `stock.error-response.ts`. Location errors (`warehouse_not_found`,
// `node_warehouse_mismatch`, …) are the warehouses module's vocabulary and are
// reused from there rather than re-declared.

/** The payload shape does not match the material's tracking mode — a quantity
 *  for a serialized material, a serial for a lot one, and so on. */
export class TrackingMismatchError extends Error {
  constructor(
    public readonly tracking: string,
    public readonly expected: string,
  ) {
    super(`material is ${tracking}; expected ${expected}`);
    this.name = 'TrackingMismatchError';
  }
}

/** The reason exists but does not apply to what is being done (or does not
 *  exist at all — an unknown code is, precisely, a code that applies to
 *  nothing). */
export class InvalidReasonContextError extends Error {
  constructor(
    public readonly reason: string,
    public readonly context: string,
  ) {
    super(`reason ${reason} does not apply to ${context}`);
    this.name = 'InvalidReasonContextError';
  }
}

export class ReasonInactiveError extends Error {
  constructor(public readonly reason: string) {
    super(`reason ${reason} is inactive`);
    this.name = 'ReasonInactiveError';
  }
}

/** 00 §6 #23: the chosen reason sets `requires_note` and the body sent none. */
export class NoteRequiredError extends Error {
  constructor(public readonly reason: string) {
    super(`reason ${reason} requires a note`);
    this.name = 'NoteRequiredError';
  }
}

/** Non-admins may not book an ad-hoc `replenishment` inbound (owner
 *  2026-07-20): for them bulk restock stays a document with an approval step. */
export class UseReplenishmentFlowError extends Error {
  constructor() {
    super('replenishment inbound is admin-only');
    this.name = 'UseReplenishmentFlowError';
  }
}

/** The source does not hold what the movement tries to take. Carries a human
 *  detail because "insufficient" is ambiguous when a lot moves two dimensions
 *  (content and packages) at once. */
export class InsufficientStockError extends Error {
  constructor(public readonly detail: string) {
    super(`insufficient stock: ${detail}`);
    this.name = 'InsufficientStockError';
  }
}

/** Per material, not global (01 §2): two vendors may reuse a serial across
 *  different products. Units never delete, so a consumed serial stays claimed. */
export class SerialExistsError extends Error {
  constructor(public readonly serialNumber: string) {
    super(`serial ${serialNumber} already exists for this material`);
    this.name = 'SerialExistsError';
  }
}

/** The unit is not `in_stock` at the source — wrong location, wrong material,
 *  or already consumed/lost. */
export class UnitNotAvailableError extends Error {
  constructor(public readonly materialUnitId: string) {
    super(`unit ${materialUnitId} is not available at the source`);
    this.name = 'UnitNotAvailableError';
  }
}

/** Self-checkout: a technician may only load THEIR OWN van (02 §4). */
export class NotOwnVanError extends Error {
  constructor(public readonly warehouseId: string) {
    super(`warehouse ${warehouseId} is not the caller's van`);
    this.name = 'NotOwnVanError';
  }
}

/** Self-checkout with nowhere to check out to. A 409, not a 403: nothing is
 *  forbidden, the tenant simply has not assigned this technician a van yet. */
export class NoAssignedWarehouseError extends Error {
  constructor() {
    super('the caller has no assigned warehouse');
    this.name = 'NoAssignedWarehouseError';
  }
}

/** Drawing from a colleague's van is forbidden outright (02 §2a/§4). */
export class SourceForbiddenError extends Error {
  constructor(public readonly warehouseId: string) {
    super(`warehouse ${warehouseId} is not a permitted source`);
    this.name = 'SourceForbiddenError';
  }
}

/** A transfer whose source and destination are the same location. Rejected
 *  rather than swallowed: the balances would net to zero and the journal would
 *  gain a row that describes nothing ever having moved. */
export class SameLocationError extends Error {
  constructor() {
    super('source and destination are the same location');
    this.name = 'SameLocationError';
  }
}
