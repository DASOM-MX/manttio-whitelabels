/** Reviewer counts behind the derived status (20 §2).
 *
 *  `reviewers: 0` is legitimate, not a bug: an all-informational send is
 *  allowed, and such a quote sits in `waiting_approval` forever because it has
 *  nothing to tally. Render that case as its own thing — left alone it reads as
 *  "stuck". */
export interface QuotationTally {
  reviewers: number;
  approved: number;
  declined: number;
  pending: number;
}
