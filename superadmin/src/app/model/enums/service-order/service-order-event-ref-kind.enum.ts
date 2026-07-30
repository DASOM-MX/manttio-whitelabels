/** What a timeline event's `ref` points at (19 §7) — parity with the backend
 *  `ServiceOrderEventRefKind`. Drives the feed's link-outs (a `Report` ref
 *  routes to the report view; the rest render as plain context until their
 *  modules land). */
export enum ServiceOrderEventRefKind {
  Visit = 'visit',
  Report = 'report',
  Line = 'line',
  Email = 'email',
  Contract = 'contract',
  Quotation = 'quotation',
}
