import { ServiceRequestStatus } from '../enums/service-requests.enum';

// Status transitions, enforced server-side (01 §4). `approved` is non-terminal;
// `closed` is a portal-admin-only move from any live state; `rejected`, `closed`
// and `cancelled` are terminal. `isAdmin` means portal admin, not staff.
export function isValidStatusTransition(
  currentStatus: ServiceRequestStatus,
  nextStatus: ServiceRequestStatus,
  isAdmin: boolean,
): boolean {
  // Terminal states cannot transition.
  const isTerminal =
    currentStatus === ServiceRequestStatus.Rejected ||
    currentStatus === ServiceRequestStatus.Closed ||
    currentStatus === ServiceRequestStatus.Cancelled;
  if (isTerminal) {
    return false;
  }

  // Cancelling is gated by the `cancel_service_requests` grant at the route, not
  // by `isAdmin`, and is allowed from **every** live state including `approved`
  // (owner, 2026-09-03 — reversing the same day's earlier `approved` block).
  // Nothing is stranded: the cancel soft-deletes every quotation issued against
  // the request in its own transaction, so the documents go with it.
  if (nextStatus === ServiceRequestStatus.Cancelled) {
    return true;
  }

  // Closing requires admin.
  if (nextStatus === ServiceRequestStatus.Closed) {
    return isAdmin;
  }

  switch (currentStatus) {
    case ServiceRequestStatus.Submitted:
      return nextStatus === ServiceRequestStatus.InReview || nextStatus === ServiceRequestStatus.Rejected;

    case ServiceRequestStatus.InReview:
      return (
        nextStatus === ServiceRequestStatus.NeedsInfo ||
        nextStatus === ServiceRequestStatus.Approved ||
        nextStatus === ServiceRequestStatus.Rejected
      );

    case ServiceRequestStatus.NeedsInfo:
      return nextStatus === ServiceRequestStatus.InReview;

    case ServiceRequestStatus.Approved:
      // Approved is non-terminal; no automatic transitions except closure.
      return false;

    default:
      return false;
  }
}
