// Service request lifecycle (client-portal 06 §3, decided 2026-08-30). Six states:
// `submitted` through `approved` are live/open, `rejected` and `closed` are terminal.
// `approved` is deliberately non-terminal: a request may carry several quotations
// over its life (01 §4).
export enum ServiceRequestStatus {
  // Filed, untouched by staff.
  Submitted = 'submitted',
  // A staff member picked it up.
  InReview = 'in_review',
  // Staff asked the contact something; ball is in the client's court.
  NeedsInfo = 'needs_info',
  // Staff accepted it and quoted. NOT terminal — a declined quotation does not
  // reopen or close anything. Staff simply issue another quotation against the
  // same request (01 §4b).
  Approved = 'approved',
  // Terminal (staff). Reason required, lives in the event note.
  Rejected = 'rejected',
  // Terminal (portal admin only). The customer says it is done (01 §1, 06 §3).
  Closed = 'closed',
}

// Append-only timeline entry types (01 §5). Mirrors `quotation_events` / the
// planned `service_order_events`: no updates, no deletes — the timeline IS the
// pre-sale record.
export enum ServiceRequestEventType {
  Created = 'service_request_created',
  EvidenceAdded = 'service_request_evidence_added',
  TakenForReview = 'service_request_taken_for_review',
  InfoRequested = 'service_request_info_requested',
  InfoProvided = 'service_request_info_provided',
  Approved = 'service_request_approved',
  Rejected = 'service_request_rejected',
  // One per quotation attached to the request, so the trail shows the
  // v1-declined → v2-issued sequence without a status change to carry it.
  QuotationLinked = 'service_request_quotation_linked',
  // Portal admin only (01 §1). Closing the request without staff action.
  Closed = 'service_request_closed',
}
