// Client-side attribution guard (utm-params plan 02 CP-1): applied by
// UtmCapture before storing and by the form script on the URL fallback before
// sending — malformed params never enter sessionStorage or the payload.
// Mirrors the backend sanitizer (doc 01 CP-2), which independently re-enforces
// the same rules; this filter is hygiene for honest traffic, not the security
// boundary (direct POSTs skip it entirely). Keep both in sync.

/** Allowlisted query params → flat payload keys. Anything else is ignored. */
export const ATTRIBUTION_PARAM_MAP: Record<string, string> = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_term: 'utmTerm',
  utm_content: 'utmContent',
  gclid: 'gclid',
  fbclid: 'fbclid',
};

const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f<>"'`]/;

/** Trim + cap; discard entirely (null) on control chars or `<>"'`` — unlike
 *  the backend (which strips), the client simply drops a dirty value. */
export function sanitizeAttributionValue(value: string, maxLength = 255): string | null {
  const trimmed = value.trim();
  if (!trimmed || FORBIDDEN_CHARS.test(trimmed)) return null;
  return trimmed.slice(0, maxLength).trim();
}

/** Allowlisted, sanitized attribution params from a query string, keyed by
 *  the flat payload names (`utmSource`…`fbclid`). */
export function collectAttributionParams(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const out: Record<string, string> = {};
  for (const [param, key] of Object.entries(ATTRIBUTION_PARAM_MAP)) {
    const raw = params.get(param);
    if (!raw) continue;
    const clean = sanitizeAttributionValue(raw);
    if (clean) out[key] = clean;
  }
  return out;
}
