// Thrown when a non-manager tries to set `visibleToRoles` (13 §4): office may
// edit a contract it can see, but only owner/admin decide who sees it. The
// controller maps this to 403 `visibility_forbidden`.
export class ContractVisibilityForbiddenError extends Error {
  constructor() {
    super('only owner/admin may set contract visibility');
  }
}
