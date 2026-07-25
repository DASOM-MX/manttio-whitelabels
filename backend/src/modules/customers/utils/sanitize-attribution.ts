// Server-side attribution hygiene for the public lead endpoint. The endpoint
// is publicly reachable, so this runs regardless of what the website filtered.
// Rule: sanitize, don't reject — a lead is never lost over bad attribution; a
// value that survives cleaning is kept, one that doesn't is dropped (returns
// undefined so the payload key disappears). The only render sink for these
// strings is the superadmin (Angular interpolation auto-escapes), so this is
// defense in depth + data hygiene for the CMS dashboard, not the sole XSS guard.

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const DANGEROUS_CHARS = /[<>"'`]/g;

export const sanitizeAttributionValue = (
  value: string,
  maxLength: number,
): string | undefined => {
  const cleaned = value
    .replace(CONTROL_CHARS, '')
    .replace(DANGEROUS_CHARS, '')
    .trim()
    .slice(0, maxLength)
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
};

// Referrers must be real http(s) URLs — anything else (javascript:, data:,
// garbage) is dropped, the lead still inserts.
export const sanitizeReferrer = (value: string): string | undefined => {
  const cleaned = sanitizeAttributionValue(value, 2048);
  if (!cleaned) return undefined;
  try {
    const url = new URL(cleaned);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  } catch {
    return undefined;
  }
  return cleaned;
};

// Landing pages are site-relative paths ("/contact-us?utm_source=…").
export const sanitizeLandingPage = (value: string): string | undefined => {
  const cleaned = sanitizeAttributionValue(value, 2048);
  if (!cleaned) return undefined;
  return /^\/[^\s]*$/.test(cleaned) ? cleaned : undefined;
};
