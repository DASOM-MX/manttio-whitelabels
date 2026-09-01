import { describe, it, expect } from 'vitest';
import { ServiceRequestStatus } from '../src/modules/service-requests/enums/service-requests.enum';
import { isValidStatusTransition } from '../src/modules/service-requests/utils/status-transition';

describe('Service Request Status Transition Guard', () => {
  describe('submitted state', () => {
    it('allows transition from submitted to in_review', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Submitted, ServiceRequestStatus.InReview, false)).toBe(
        true,
      );
    });

    it('allows transition from submitted to rejected', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Submitted, ServiceRequestStatus.Rejected, false)).toBe(
        true,
      );
    });

    it('allows transition from submitted to closed (admin only)', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Submitted, ServiceRequestStatus.Closed, true)).toBe(
        true,
      );
    });

    it('rejects transition from submitted to closed (non-admin)', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Submitted, ServiceRequestStatus.Closed, false)).toBe(
        false,
      );
    });

    it('rejects transition from submitted to needs_info', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Submitted, ServiceRequestStatus.NeedsInfo, false)).toBe(
        false,
      );
    });

    it('rejects transition from submitted to approved', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Submitted, ServiceRequestStatus.Approved, false)).toBe(
        false,
      );
    });

    it('rejects transition from submitted to submitted', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Submitted, ServiceRequestStatus.Submitted, false)).toBe(
        false,
      );
    });
  });

  describe('in_review state', () => {
    it('allows transition from in_review to needs_info', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.InReview, ServiceRequestStatus.NeedsInfo, false)).toBe(true);
    });

    it('allows transition from in_review to approved', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.InReview, ServiceRequestStatus.Approved, false)).toBe(true);
    });

    it('allows transition from in_review to rejected', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.InReview, ServiceRequestStatus.Rejected, false)).toBe(true);
    });

    it('allows transition from in_review to closed (admin only)', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.InReview, ServiceRequestStatus.Closed, true)).toBe(true);
    });

    it('rejects transition from in_review to closed (non-admin)', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.InReview, ServiceRequestStatus.Closed, false)).toBe(
        false,
      );
    });

    it('rejects transition from in_review to submitted', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.InReview, ServiceRequestStatus.Submitted, false)).toBe(false);
    });

    it('rejects transition from in_review to in_review', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.InReview, ServiceRequestStatus.InReview, false)).toBe(false);
    });
  });

  describe('needs_info state', () => {
    it('allows transition from needs_info to in_review (client answers)', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.NeedsInfo, ServiceRequestStatus.InReview, false)).toBe(true);
    });

    it('allows transition from needs_info to closed (admin only)', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.NeedsInfo, ServiceRequestStatus.Closed, true)).toBe(true);
    });

    it('rejects transition from needs_info to closed (non-admin)', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.NeedsInfo, ServiceRequestStatus.Closed, false)).toBe(
        false,
      );
    });

    it('rejects transition from needs_info to approved', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.NeedsInfo, ServiceRequestStatus.Approved, false)).toBe(false);
    });

    it('rejects transition from needs_info to rejected', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.NeedsInfo, ServiceRequestStatus.Rejected, false)).toBe(false);
    });

    it('rejects transition from needs_info to needs_info', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.NeedsInfo, ServiceRequestStatus.NeedsInfo, false)).toBe(false);
    });

    it('rejects transition from needs_info to submitted', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.NeedsInfo, ServiceRequestStatus.Submitted, false)).toBe(false);
    });
  });

  describe('approved state (non-terminal)', () => {
    it('rejects any non-close transition from approved', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Approved, ServiceRequestStatus.InReview, false)).toBe(false);
      expect(isValidStatusTransition(ServiceRequestStatus.Approved, ServiceRequestStatus.NeedsInfo, false)).toBe(false);
      expect(isValidStatusTransition(ServiceRequestStatus.Approved, ServiceRequestStatus.Rejected, false)).toBe(false);
      expect(isValidStatusTransition(ServiceRequestStatus.Approved, ServiceRequestStatus.Submitted, false)).toBe(false);
      expect(isValidStatusTransition(ServiceRequestStatus.Approved, ServiceRequestStatus.Approved, false)).toBe(false);
    });

    it('allows transition from approved to closed (admin only)', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Approved, ServiceRequestStatus.Closed, true)).toBe(true);
    });

    it('rejects transition from approved to closed (non-admin)', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Approved, ServiceRequestStatus.Closed, false)).toBe(
        false,
      );
    });

    it('confirms approved is non-terminal by allowing closure', () => {
      const isNonTerminal = isValidStatusTransition(ServiceRequestStatus.Approved, ServiceRequestStatus.Closed, true);
      expect(isNonTerminal).toBe(true);
    });
  });

  describe('rejected state (terminal)', () => {
    it('rejects all transitions from rejected', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Rejected, ServiceRequestStatus.Submitted, false)).toBe(false);
      expect(isValidStatusTransition(ServiceRequestStatus.Rejected, ServiceRequestStatus.InReview, false)).toBe(false);
      expect(isValidStatusTransition(ServiceRequestStatus.Rejected, ServiceRequestStatus.NeedsInfo, false)).toBe(false);
      expect(isValidStatusTransition(ServiceRequestStatus.Rejected, ServiceRequestStatus.Approved, false)).toBe(false);
      expect(isValidStatusTransition(ServiceRequestStatus.Rejected, ServiceRequestStatus.Rejected, false)).toBe(false);
    });

    it('rejects transition from rejected to closed even for admin', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Rejected, ServiceRequestStatus.Closed, true)).toBe(false);
    });
  });

  describe('closed state (terminal)', () => {
    it('rejects all transitions from closed', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Closed, ServiceRequestStatus.Submitted, false)).toBe(false);
      expect(isValidStatusTransition(ServiceRequestStatus.Closed, ServiceRequestStatus.InReview, false)).toBe(false);
      expect(isValidStatusTransition(ServiceRequestStatus.Closed, ServiceRequestStatus.NeedsInfo, false)).toBe(false);
      expect(isValidStatusTransition(ServiceRequestStatus.Closed, ServiceRequestStatus.Approved, false)).toBe(false);
      expect(isValidStatusTransition(ServiceRequestStatus.Closed, ServiceRequestStatus.Rejected, false)).toBe(false);
    });

    it('rejects transition from closed to closed even for admin', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Closed, ServiceRequestStatus.Closed, true)).toBe(false);
    });
  });

  describe('close transitions (portal admin only)', () => {
    it('allows admin to close from any non-terminal state', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Submitted, ServiceRequestStatus.Closed, true)).toBe(true);
      expect(isValidStatusTransition(ServiceRequestStatus.InReview, ServiceRequestStatus.Closed, true)).toBe(true);
      expect(isValidStatusTransition(ServiceRequestStatus.NeedsInfo, ServiceRequestStatus.Closed, true)).toBe(true);
      expect(isValidStatusTransition(ServiceRequestStatus.Approved, ServiceRequestStatus.Closed, true)).toBe(true);
    });

    it('rejects non-admin from closing any state', () => {
      expect(isValidStatusTransition(ServiceRequestStatus.Submitted, ServiceRequestStatus.Closed, false)).toBe(
        false,
      );
      expect(isValidStatusTransition(ServiceRequestStatus.InReview, ServiceRequestStatus.Closed, false)).toBe(
        false,
      );
      expect(isValidStatusTransition(ServiceRequestStatus.NeedsInfo, ServiceRequestStatus.Closed, false)).toBe(
        false,
      );
      expect(isValidStatusTransition(ServiceRequestStatus.Approved, ServiceRequestStatus.Closed, false)).toBe(
        false,
      );
    });
  });

  describe('invariant checks', () => {
    it('verified: approved is non-terminal', () => {
      const approvedCanReachClosed = isValidStatusTransition(
        ServiceRequestStatus.Approved,
        ServiceRequestStatus.Closed,
        true,
      );
      const approvedCannotDieToDirect =
        !isValidStatusTransition(ServiceRequestStatus.Approved, ServiceRequestStatus.Rejected, false) &&
        !isValidStatusTransition(ServiceRequestStatus.Approved, ServiceRequestStatus.Submitted, false);
      expect(approvedCanReachClosed).toBe(true);
      expect(approvedCannotDieToDirect).toBe(true);
    });

    it('verified: closed is reachable only with is_admin', () => {
      const closedReachableByAdmin = isValidStatusTransition(
        ServiceRequestStatus.InReview,
        ServiceRequestStatus.Closed,
        true,
      );
      const closedNotReachableByNonAdmin = !isValidStatusTransition(
        ServiceRequestStatus.InReview,
        ServiceRequestStatus.Closed,
        false,
      );
      expect(closedReachableByAdmin).toBe(true);
      expect(closedNotReachableByNonAdmin).toBe(true);
    });

    it('verified: every rejected transition is actually rejected', () => {
      // Sample of rejected transitions that should never work.
      const rejected = [
        isValidStatusTransition(ServiceRequestStatus.Submitted, ServiceRequestStatus.Approved, false),
        isValidStatusTransition(ServiceRequestStatus.Submitted, ServiceRequestStatus.NeedsInfo, false),
        isValidStatusTransition(ServiceRequestStatus.InReview, ServiceRequestStatus.Submitted, false),
        isValidStatusTransition(ServiceRequestStatus.NeedsInfo, ServiceRequestStatus.Approved, false),
        isValidStatusTransition(ServiceRequestStatus.Approved, ServiceRequestStatus.InReview, false),
        isValidStatusTransition(ServiceRequestStatus.Rejected, ServiceRequestStatus.InReview, false),
        isValidStatusTransition(ServiceRequestStatus.Closed, ServiceRequestStatus.Submitted, false),
      ];
      expect(rejected).not.toContain(true);
      expect(rejected.every((r) => r === false)).toBe(true);
    });
  });
});
