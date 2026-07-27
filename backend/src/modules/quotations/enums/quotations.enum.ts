// Quotation lifecycle (20 §2, decided 2026-07-24). Seven states of two kinds:
// five track the quote's *position* and are re-derived from the reviewer tally
// on every response (automatic and mutable — a reviewer may change their mind
// mid-flight); two are explicit staff terminal actions, each carrying a
// mandatory `resolutionReason` so the audit always has the "why".
export enum QuotationStatus {
  // Created, editable, not yet mailed. The only state PATCH accepts.
  Draft = 'draft',
  // Mailed, no approvals yet.
  WaitingApproval = 'waiting_approval',
  // At least one reviewer approved, but not all of them.
  PartiallyApproved = 'partially_approved',
  // Every reviewer approved.
  Approved = 'approved',
  // Every reviewer declined — still a LIVE state. A declined quote is never
  // auto-cancelled: staff can convert it anyway (owner/admin override) or leave
  // it open for minds to change.
  Declined = 'declined',
  // Explicit staff abandonment. Terminal.
  Cancelled = 'cancelled',
  // Explicit staff conversion into a service order (19). Terminal.
  // Unreachable until 19 lands — see `quotations.service.ts`.
  OrderCreated = 'order_created',
}

// The states whose value is a pure function of the reviewer tally. Membership
// answers two different questions, which is why it's one list: whether a
// response may re-derive the status, and whether the quote is still live.
// `Draft` is excluded (nobody has been mailed yet), and so are the two terminal
// actions — a resolved quote never moves again.
export const TALLY_STATUSES: QuotationStatus[] = [
  QuotationStatus.WaitingApproval,
  QuotationStatus.PartiallyApproved,
  QuotationStatus.Approved,
  QuotationStatus.Declined,
];

// Live = not resolved by a staff terminal action. Drives what staff may still
// do (send/revise/cancel) and what the public page renders as actionable.
export const LIVE_STATUSES: QuotationStatus[] = [QuotationStatus.Draft, ...TALLY_STATUSES];

export const isTallyStatus = (status: QuotationStatus) => TALLY_STATUSES.includes(status);

export const isLiveStatus = (status: QuotationStatus) => LIVE_STATUSES.includes(status);

// A reviewer's current answer (20 §1). Stored on `quotation_recipients` and
// overwritten when they change their mind — the *history* of changes lives in
// `quotation_events`, one row per response, so the trail shows who flipped.
export enum QuotationResponse {
  Approved = 'approved',
  Declined = 'declined',
}

// Append-only timeline entry types (20 §5). Mirrors `customer_interactions` /
// the planned `service_order_events`: no updates, no deletes — the timeline IS
// the pre-sale record.
export enum QuotationEventType {
  Created = 'quotation_created',
  LineAdded = 'quotation_line_added',
  // One per recipient; `changes` records reviewer vs informational.
  Sent = 'quotation_sent',
  // A token page was opened (first view per recipient).
  Viewed = 'quotation_viewed',
  // One per response INCLUDING mind-changes, so the trail shows who flipped.
  ReviewerResponded = 'quotation_reviewer_responded',
  // The tally moved the status (waiting → partially_approved → approved …).
  StatusDerived = 'quotation_status_derived',
  // Staff conversion → service order (19). Not emitted until 19 lands.
  OrderCreated = 'quotation_order_created',
  // Staff abandonment; a revise-cancel notes the successor quote.
  Cancelled = 'quotation_cancelled',
  // Audited soft delete. Written even though the timeline becomes unreachable
  // through the API once the quote is tombstoned — the row is the record, and
  // a deletion with no trail is exactly the gap an audit trail exists to close.
  Deleted = 'quotation_deleted',
}

// What `refId` points at, when an event links out. The acting contact is NOT a
// member: that already has its own `contactId` column, and a second way to say
// the same thing would let two events disagree about who acted.
export enum QuotationEventRefKind {
  Recipient = 'recipient',
  Quotation = 'quotation',
  // Declared now, first written by 19 — the enum is the contract the
  // convergence fills.
  ServiceOrder = 'service_order',
}
