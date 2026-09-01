// Portal token signing parameters (02 §1). Separate from the staff surface's
// values on purpose: the portal is a second, parallel auth surface with its own
// secret, so its token lifetime is its own policy decision and must not drift
// into the staff one by sharing a constant.
export const PORTAL_TOKEN_ALG = 'HS256';

// A2 (owner 2026-08-30): 2 days. Deliberately shorter than the staff dev token —
// a portal session belongs to someone outside the tenant.
export const PORTAL_TOKEN_TTL = '2d';
