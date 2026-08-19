/** Order lifecycle (19 §1) — full parity with the backend `ServiceOrderStatus`.
 *  Manual in v1: staff complete or cancel explicitly; both moves are one-way. */
export enum ServiceOrderStatus {
  Open = 'open',
  Completed = 'completed',
  Cancelled = 'cancelled',
}
