// Gate failures for the quote → order conversion (20 §6). Thrown by the
// conversion service, mapped to HTTP in the quotations controller (which owns
// the `POST /quotations/:id/order` route). `QuotationNotLiveError` is reused
// from the quotations module for terminal/raced states.

/** Past `validUntil` the quote can't convert — prices may be stale; staff
 *  revise for current prices instead (20 §2). Maps to 409. */
export class QuotationExpiredError extends Error {
  constructor(public validUntil: string) {
    super(`quotation expired on ${validUntil} — revise it for current prices`);
    this.name = 'QuotationExpiredError';
  }
}

/** Office converting with zero approvals. Only owner/admin may override the
 *  approval gate (20 §7). Maps to 403. */
export class QuotationApprovalGateError extends Error {
  constructor() {
    super('converting an unapproved quotation requires the owner or admin role');
    this.name = 'QuotationApprovalGateError';
  }
}

/** The explosion inputs must cover the quote's distinct services exactly —
 *  every service once, no strangers. Names both defect lists so the dialog can
 *  mark the rows. Maps to 422. */
export class AssignmentCoverageError extends Error {
  constructor(
    public missing: string[],
    public unknown: string[],
  ) {
    super(
      `assignments must cover the quotation's services exactly` +
        (missing.length ? ` — missing: ${missing.join(', ')}` : '') +
        (unknown.length ? ` — not on the quotation: ${unknown.join(', ')}` : ''),
    );
    this.name = 'AssignmentCoverageError';
  }
}

/** The quote's total units exceed what one create transaction may explode —
 *  the same 50-report bound the direct path's validator enforces (19 §2 caps,
 *  2026-07-27). Maps to 409: the request is well-formed, the quote is what
 *  can't be exploded whole. */
export class ExplosionTooLargeError extends Error {
  constructor(public totalUnits: number) {
    super(`the quotation explodes ${totalUnits} reports; the limit per order is 50`);
    this.name = 'ExplosionTooLargeError';
  }
}

/** The quote carries a line shape the ORDER model cannot represent yet (line
 *  model v2, 2026-07-29): an off-catalog line (order lines are keyed by
 *  service), a fractional quantity (the explosion counts whole report
 *  skeletons), or a per-line discount (order lines carry none — converting
 *  would silently charge the pre-discount price). Refused whole rather than
 *  converted wrong; 19-side support is the follow-up (20 "Open decisions").
 *  Maps to 409 `quotation_line_not_convertible`. */
export class QuotationLineNotConvertibleError extends Error {
  constructor(public serviceName: string) {
    super(`quotation line cannot convert to an order line yet: ${serviceName}`);
    this.name = 'QuotationLineNotConvertibleError';
  }
}
