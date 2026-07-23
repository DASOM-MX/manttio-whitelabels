export class InvalidVisitStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`invalid visit status transition '${from}' -> '${to}'`);
    this.name = 'InvalidVisitStatusTransitionError';
  }
}

export class VisitNotReassignableError extends Error {
  constructor(status: string) {
    super(`only scheduled visits can be reassigned (visit is '${status}')`);
    this.name = 'VisitNotReassignableError';
  }
}

export class TechSwapNotAllowedError extends Error {
  constructor() {
    super('technicians can only hand off visits currently assigned to them');
    this.name = 'TechSwapNotAllowedError';
  }
}

export class InvalidVisitWindowError extends Error {
  constructor() {
    super('scheduledEnd must be after scheduledStart');
    this.name = 'InvalidVisitWindowError';
  }
}
