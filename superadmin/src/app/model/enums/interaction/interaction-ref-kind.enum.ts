/** What a `system` timeline entry links out to (08 §2) — mirrors the backend's
 *  `InteractionRefKind`.
 *
 *  The client timeline is the audit home for entities that carry no trail table
 *  of their own (contracts, 13 §3), so this list grows as those land. Entries
 *  are readable through `GET /customers/:id/interactions?refKind&refId`, which
 *  is how an entity's own audit card reads its trail back out. */
export enum InteractionRefKind {
  StatusChange = 'status_change',
  Report = 'report',
  Bill = 'bill',
  ServiceOrder = 'service_order',
  Quotation = 'quotation',
  Contract = 'contract',
}
