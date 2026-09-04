/**
 * Invalid status transition attempted (enforced by the transition guard).
 */
export class InvalidStatusTransitionError extends Error {
  constructor(currentStatus: string, nextStatus: string) {
    super(`Cannot transition from ${currentStatus} to ${nextStatus}`);
    this.name = 'InvalidStatusTransitionError';
  }
}

/**
 * Request must be in `needs_info` state to receive an answer.
 */
export class NotInNeedsInfoError extends Error {
  constructor() {
    super('Request is not waiting for information');
    this.name = 'NotInNeedsInfoError';
  }
}

/**
 * Only a portal admin can close a request.
 */
export class NotAnAdminError extends Error {
  constructor() {
    super('Only an admin can close requests');
    this.name = 'NotAnAdminError';
  }
}
