// Activity-timeline entry types (08 §2). `System` entries are backend-generated
// (customer lifecycle + status changes) and never client-submitted; the rest
// are manual touches logged by a user through the composer.
export enum InteractionType {
  Note = 'note',
  Call = 'call',
  Whatsapp = 'whatsapp',
  Email = 'email',
  Visit = 'visit',
  System = 'system',
}

// The composer-selectable subset — the API rejects `System` on write (08 §4).
export const MANUAL_INTERACTION_TYPES = [
  InteractionType.Note,
  InteractionType.Call,
  InteractionType.Whatsapp,
  InteractionType.Email,
  InteractionType.Visit,
] as const;

// What a `system` entry links out to (08 §2). TS-only — the table carries no
// ref-kind CHECK, so adding a member needs no DDL.
export enum InteractionRefKind {
  StatusChange = 'status_change',
  Report = 'report',
  Bill = 'bill',
  /** Emitted when an order is created (19 §2). Complementary to the order's own
   *  timeline, not a duplicate of it: this one answers "what happened with this
   *  client", the order timeline answers "what happened on this job". */
  ServiceOrder = 'service_order',
}
