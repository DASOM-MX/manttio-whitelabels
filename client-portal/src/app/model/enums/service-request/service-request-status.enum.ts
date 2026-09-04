/** Service-request lifecycle — mirrors the backend `ServiceRequestStatus`.
 *  Used here only to label the equipment detail's linked-requests list
 *  (04 §7); the requests section itself is 06 CP-3. */
export enum ServiceRequestStatus {
  Submitted = 'submitted',
  InReview = 'in_review',
  NeedsInfo = 'needs_info',
  Approved = 'approved',
  Rejected = 'rejected',
  Closed = 'closed',
  Cancelled = 'cancelled',
}
