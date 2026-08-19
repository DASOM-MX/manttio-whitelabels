/** Quotation lifecycle (20 §2). The first five are position + reviewer-tally
 *  states, re-derived on every response and therefore mutable; the last two are
 *  explicit staff terminal actions carrying a mandatory comment. */
export enum QuotationStatus {
  /** The only state PATCH accepts. */
  Draft = 'draft',
  /** Mailed, no approvals yet — and where a zero-reviewer quote rests. */
  WaitingApproval = 'waiting_approval',
  PartiallyApproved = 'partially_approved',
  Approved = 'approved',
  /** Still **live**: a declined quote is never auto-cancelled. */
  Declined = 'declined',
  Cancelled = 'cancelled',
  /** Unreachable until 19 lands — nothing sets it yet. */
  OrderCreated = 'order_created',
}
