import { QuotationResponse, QuotationStatus } from '../enums/quotations.enum';

/** One reviewer's current answer, as the tally sees it. */
export interface ReviewerTallyInput {
  response: QuotationResponse | null;
}

/** The counts behind a derived status — surfaced to the UI as "2/3 aprobaron"
 *  (20 §8) and to `quotation_events.changes` so the trail records *why* the
 *  status moved, not just that it did. */
export interface QuotationTally {
  reviewers: number;
  approved: number;
  declined: number;
  pending: number;
}

export const tallyOf = (reviewers: ReviewerTallyInput[]): QuotationTally => {
  const approved = reviewers.filter((r) => r.response === QuotationResponse.Approved).length;
  const declined = reviewers.filter((r) => r.response === QuotationResponse.Declined).length;
  return {
    reviewers: reviewers.length,
    approved,
    declined,
    pending: reviewers.length - approved - declined,
  };
};

/** The tally → status function (20 §2). Pure, total, and re-run on every
 *  response, so a reviewer changing their mind moves the quote back down the
 *  ladder as readily as up it.
 *
 *  Zero reviewers resolves to `waiting_approval` rather than throwing: an
 *  all-informational send is allowed (owner 2026-07-26), and such a quote
 *  simply has nothing to tally — it rests there until staff cancel or convert
 *  it. Treating it as an error would reject a legitimate workflow, and treating
 *  it as `approved` (vacuously "all approved") would be a dangerous lie. */
export const deriveStatus = (reviewers: ReviewerTallyInput[]): QuotationStatus => {
  const { reviewers: n, approved, declined } = tallyOf(reviewers);
  if (n === 0) return QuotationStatus.WaitingApproval;
  if (approved === n) return QuotationStatus.Approved;
  // Checked before `approved >= 1` can't apply — all-declined and any-approved
  // are mutually exclusive.
  if (declined === n) return QuotationStatus.Declined;
  if (approved >= 1) return QuotationStatus.PartiallyApproved;
  return QuotationStatus.WaitingApproval;
};
