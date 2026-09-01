import { ServiceRequestStatus } from '../enums/service-requests.enum';

// Status transitions, enforced server-side (01 §4). `approved` is non-terminal;
// `closed` is a portal-admin-only move from any live state; `rejected` and
// `closed` are terminal. `isAdmin` means portal admin, not staff.
export function isValidStatusTransition(
  currentStatus: ServiceRequestStatus,
  nextStatus: ServiceRequestStatus,
  isAdmin: boolean,
): boolean {
  // Terminal states cannot transition.
  const isTerminal =
    currentStatus === ServiceRequestStatus.Rejected || currentStatus === ServiceRequestStatus.Closed;
  if (isTerminal) {
    return false;
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
