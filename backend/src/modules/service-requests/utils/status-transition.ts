import { ServiceRequestStatus } from '../enums/service-requests.enum';

/**
 * Determine whether a status transition is valid (client-portal 01 §4).
 * Transitions are enforced server-side, not just in the UI.
 *
 * Transition table:
 * - submitted → in_review | rejected
 * - in_review → needs_info | approved | rejected
 * - needs_info → in_review (client answers)
 * - approved → stays open (not terminal)
 * - * (non-terminal) → closed (portal admin only)
 * - rejected / closed are terminal
 *
 * @param currentStatus The current status
 * @param nextStatus The proposed status
 * @param isAdmin Whether the actor is a portal admin (only they can close)
 * @returns true if the transition is allowed
 */
export function isValidStatusTransition(
  currentStatus: ServiceRequestStatus,
  nextStatus: ServiceRequestStatus,
  isAdmin: boolean = false,
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

  // State machine transitions for non-terminal states.
  const currentStatusAsString = currentStatus as string;

  switch (currentStatusAsString) {
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
      // This catches terminal states, which we already checked above.
      return false;
  }
}
