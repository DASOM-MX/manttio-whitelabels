/** Order lifecycle — mirrors the backend `ServiceOrderStatus`. The portal
 *  only ever receives `open`/`completed` (04 §2, A7 — `cancelled` is not the
 *  customer's business); kept whole for wire-type fidelity. */
export enum ServiceOrderStatus {
  Open = 'open',
  Completed = 'completed',
  Cancelled = 'cancelled',
}
