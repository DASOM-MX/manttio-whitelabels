/** Quotation lifecycle — mirrors the backend `QuotationStatus`. The portal
 *  only ever receives `waiting_approval`, `partially_approved`, `approved`,
 *  `declined`, `order_created` (04 §2, A7); `draft`/`cancelled` are kept for
 *  wire-type fidelity. */
export enum QuotationStatus {
  Draft = 'draft',
  WaitingApproval = 'waiting_approval',
  PartiallyApproved = 'partially_approved',
  Approved = 'approved',
  Declined = 'declined',
  Cancelled = 'cancelled',
  OrderCreated = 'order_created',
}
