/** Append-only timeline entry types (20 §5). */
export enum QuotationEventType {
  Created = 'quotation_created',
  LineAdded = 'quotation_line_added',
  Sent = 'quotation_sent',
  Viewed = 'quotation_viewed',
  /** One per response **including mind-changes**, so the trail shows who
   *  flipped and why. */
  ReviewerResponded = 'quotation_reviewer_responded',
  StatusDerived = 'quotation_status_derived',
  OrderCreated = 'quotation_order_created',
  Cancelled = 'quotation_cancelled',
  Deleted = 'quotation_deleted',
}
