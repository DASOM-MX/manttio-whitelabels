/** Dispatch priority (19 CP-2b; ladder widened 2026-07-31) — full parity with
 *  the backend `ServiceOrderPriority`. Five steps ranked low → urgent,
 *  `normal` the birth default; any staff may move it while the order is open. */
export enum ServiceOrderPriority {
  Low = 'low',
  Normal = 'normal',
  Medium = 'medium',
  High = 'high',
  Urgent = 'urgent',
}
