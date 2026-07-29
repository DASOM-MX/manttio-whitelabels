/** A send-dialog row as the template renders it: the contact joined with its
 *  standing on this quote and the form's current ticks. */
export interface SendRecipientRow {
  index: number;
  contactId: string;
  name: string;
  email: string;
  /** No address on file. The API fails the **whole** send on such a contact
   *  rather than dropping it quietly, so the row is locked instead. */
  hasEmail: boolean;
  /** Already a recipient — a re-send keeps their existing link working. */
  alreadySent: boolean;
  /** They are a reviewer who has already approved, so re-sending to them does
   *  not disturb the tally. */
  hasApproved: boolean;
  included: boolean;
  isReviewer: boolean;
}
