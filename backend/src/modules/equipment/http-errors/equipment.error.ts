// The report a retro-link points at must belong to the same customer as the
// equipment (11 §2 — the picker only offers same-client reports; the backend
// enforces it). Controller maps this to 400.
export class ReportCustomerMismatchError extends Error {
  constructor() {
    super('report belongs to a different customer');
    this.name = 'ReportCustomerMismatchError';
  }
}
