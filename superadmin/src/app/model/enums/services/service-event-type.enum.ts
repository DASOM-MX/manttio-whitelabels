/** Append-only trail entry types (18 §6.1). Full parity with the backend
 *  `ServiceEventType`. `Deleted` never reaches this UI — the timeline 404s
 *  along with the tombstoned service — but parity keeps the contract whole. */
export enum ServiceEventType {
  Created = 'service_created',
  Updated = 'service_updated',
  Deleted = 'service_deleted',
}
