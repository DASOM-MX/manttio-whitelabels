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

/**
 * The request already produced a service order, so it cannot be withdrawn
 * (client-portal 06 §3, owner 2026-09-03). The work is scheduled; the order is
 * what has to be cancelled, and only staff can do that.
 *
 * Spanish, unlike its siblings here: this one reaches the customer verbatim
 * (portal toasts render the backend's `message`), and it has to tell them what
 * to do next.
 */
export class ServiceRequestHasOrderError extends Error {
  constructor(public readonly orderFolios: string[]) {
    super(
      `Esta solicitud ya generó ${orderFolios.length === 1 ? 'la orden de servicio' : 'las órdenes de servicio'} ` +
        `${orderFolios.join(', ')}. Cancela ${orderFolios.length === 1 ? 'la orden' : 'las órdenes'} primero.`,
    );
    this.name = 'ServiceRequestHasOrderError';
  }
}
