/** Dispatch priority (19 CP-2b) — full parity with the backend
 *  `ServiceOrderPriority`. Two levels only: the flag means "jump the queue",
 *  not a severity ladder; any staff may flip it while the order is open. */
export enum ServiceOrderPriority {
  Normal = 'normal',
  Urgent = 'urgent',
}
