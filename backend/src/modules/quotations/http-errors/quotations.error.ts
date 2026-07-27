import type { QuotationStatus } from '../enums/quotations.enum';

/** A draft-only mutation reached a quote that has already been mailed (20 §9).
 *  A conflict, not a validation failure: the payload is fine, the quote has
 *  simply moved past the point where edits are honest — someone has already
 *  been shown these numbers. Controller maps it to `409 quotation_not_draft`. */
export class QuotationNotDraftError extends Error {
  constructor(public status: QuotationStatus) {
    super(`quotation is not a draft (status: ${status})`);
    this.name = 'QuotationNotDraftError';
  }
}

/** Send / revise / cancel reached a quote already resolved by a staff terminal
 *  action (`cancelled` / `order_created`). Terminal means terminal — the way
 *  forward is a new quote, not resurrecting this one.
 *  Controller maps it to `409 quotation_not_live`. */
export class QuotationNotLiveError extends Error {
  constructor(public status: QuotationStatus) {
    super(`quotation is no longer live (status: ${status})`);
    this.name = 'QuotationNotLiveError';
  }
}

/** A line referenced a service that is missing or soft-deleted. A 400 rather
 *  than a 404: the *quotation* request is what's malformed, and naming the id
 *  lets the builder mark the offending row.
 *  Controller maps it to `400 service_not_found`. */
export class QuotationServiceNotFoundError extends Error {
  constructor(public serviceId: string) {
    super(`service not found or deleted: ${serviceId}`);
    this.name = 'QuotationServiceNotFoundError';
  }
}

/** A recipient contact doesn't exist, or belongs to a different customer than
 *  the quote. The second case is the one that matters: it would mail one
 *  client's prices to another's inbox, so it fails closed rather than silently
 *  skipping the row. Controller maps it to `400 invalid_recipient`. */
export class InvalidRecipientError extends Error {
  constructor(public contactId: string) {
    super(`contact is not a valid recipient for this quotation: ${contactId}`);
    this.name = 'InvalidRecipientError';
  }
}

/** A non-reviewer token tried to approve/decline (20 §4). Their link is a
 *  read-only copy. Controller maps it to `403 not_a_reviewer`. */
export class NotAReviewerError extends Error {
  constructor() {
    super('this recipient is informational and cannot respond');
    this.name = 'NotAReviewerError';
  }
}

/** A response arrived after `validUntil`, or on a quote already resolved. The
 *  page stays readable — only the action is refused, because an answer given
 *  against expired pricing isn't one the tenant can honour.
 *  Controller maps it to `409 quotation_closed`. */
export class QuotationClosedError extends Error {
  constructor(public reason: 'expired' | 'resolved') {
    super(`quotation is closed for responses (${reason})`);
    this.name = 'QuotationClosedError';
  }
}
