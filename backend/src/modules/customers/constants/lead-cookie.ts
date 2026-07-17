// Dedup cookie for the public lead endpoint: set on a successful submit,
// rejected server-side while present. UX-level abuse dial (any browser can
// clear it) — the per-IP throttle and Turnstile are the real gates.
export const LEAD_COOKIE_NAME = 'lead_submitted';

// How long a browser is considered "already submitted". A dial: long enough to
// stop casual re-sends, short enough that a genuine follow-up request works.
export const LEAD_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
