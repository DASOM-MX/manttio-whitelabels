/** A reviewer's current answer. Mutable — they may come back and flip it while
 *  the quote is live, and each change is re-logged on the timeline. */
export enum QuotationResponse {
  Approved = 'approved',
  Declined = 'declined',
}
