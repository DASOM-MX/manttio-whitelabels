// Thrown when a status change requests a transition the lifecycle doesn't allow
// (08 §1). The controller maps it to 409.
export class InvalidStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`invalid status transition '${from}' -> '${to}'`);
    this.name = 'InvalidStatusTransitionError';
  }
}

// Thrown when a customer is blacklisted without a reason (08 §1). The reason is
// persisted to `customers.blacklist_reason`. The controller maps it to 400.
export class BlacklistReasonRequiredError extends Error {
  constructor() {
    super('a reason is required to blacklist a customer');
    this.name = 'BlacklistReasonRequiredError';
  }
}
