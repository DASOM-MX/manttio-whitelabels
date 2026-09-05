/** Login reached an account staff turned off — suspended, or revoked via soft
 *  delete. The one login failure that answers with its own code (owner
 *  2026-09-05, superseding 02 §3's identical body): the customer is told their
 *  access is off rather than left retyping a correct password. Controller maps
 *  it to `401 account_suspended`. */
export class PortalAccountSuspendedError extends Error {
  constructor() {
    super('portal account is suspended');
    this.name = 'PortalAccountSuspendedError';
  }
}
