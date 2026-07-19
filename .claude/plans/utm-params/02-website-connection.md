# utm-params 02 — Website connection (contact page + form + capture)

> **Status:** not-started · **Depends on:** [01-fullstack-implementation](01-fullstack-implementation.md) CP-2 (the `POST /public/leads` endpoint)
> **Owner:** — · **Last updated:** 2026-07-16
> **PR:** PR-B `feat(website)` on branch `feature/website-contact-form` (created after PR-A merges) · base `main`

Shared context + settled decisions live at the top of [01-fullstack-implementation](01-fullstack-implementation.md).

Site facts: SSR per-request on Workers (`prerender = false`), plain `<script>` blocks with `data-*` hooks (no framework), Tailwind 3.4 only + brand CSS vars, no `<form>`/`<input>` precedent (net-new styling from tokens: granite borders, cyan focus ring), es_MX copy, no inline `style=`, anime.js for animations only.

## CP-1 — Attribution capture + env plumbing

- [ ] `src/components/UtmCapture.astro` — markup-less; on load, if no `sessionStorage['lead-attribution']` (**first-touch, never overwrite**) and `utm_source` in `location.search`: store `{ params (source/medium/campaign/term/content/gclid/fbclid), referrer, landingPage: location.pathname, ts }`; try/catch (storage disabled → form falls back to current-URL params). Include on `index.astro`.
- [ ] `src/lib/sanitize-attribution.ts` — shared client-side value guard, applied by UtmCapture **before storing** and by the form script on the URL fallback **before sending**: allowlist of known keys only (already the map), then per value trim, cap at 255, and **discard** any value containing control characters or `` <>"'` `` — malformed params never enter sessionStorage or the payload. Mirrors the backend sanitizer (doc 01 CP-2), which independently re-enforces the same rules — the frontend filter is hygiene for honest traffic, not the security boundary (direct POSTs skip it entirely).
- [ ] `src/lib/runtime-env.ts` — `resolveRuntimeVar(name, publicFallbackKey)` following the `resolveBaseUrl` pattern (`api.ts:27-40`); export `resolveBaseUrl` from `lib/api.ts`.
- [ ] `wrangler.jsonc` — add `vars.TURNSTILE_SITE_KEY` (per-tenant deploy value like `API_BASE_URL`; site keys are public). Local `.env` (uncommitted): `PUBLIC_API_BASE_URL=http://127.0.0.1:8787`, `PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` (always-pass test key); document both in `.env.example`.

## CP-2 — `/contact-us` page + form

- [ ] `src/pages/contact-us.astro` — `prerender = false`; frontmatter mirrors `index.astro` (getSiteData, buildBrandCss, canonical/OG meta, title `${brand.name} — Contacto`) + `apiBase = await resolveBaseUrl()` + `siteKey = await resolveRuntimeVar(...)`. Head: `<script is:inline src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer>`. Body: Header → compact dark page-header band ("Contáctanos / …") → ContactForm → Footer → UtmCapture.
- [ ] `src/components/ContactForm.astro` — props `{ apiBase, siteKey, brand }`. Null apiBase/siteKey → direct-channel fallback (tel/mailto buttons from `brand.contact`), not a dead form. Fields: **nombre\* / apellido\*** / teléfono / email (helper "Proporciona al menos un correo o teléfono") / **tipo de cliente\* radio Persona|Empresa** (`person|business`) / **nombre de la empresa\*** — hidden until Empresa is selected, then required (small `<script>`-toggled reveal, `hidden` class + `required` attr sync) / **comentarios** textarea (optional) / implicit-render `<div class="cf-turnstile" data-sitekey={siteKey}>`; submit `bg-cyan-500 hover:bg-cyan-600`; `<label for>` + `autocomplete`; Spanish inline errors. Root: `data-contact-form data-api-base={apiBase}`.
- [ ] Client script — **direct browser POST** to `${apiBase}/public/leads` (backend CORS reflects the origin **with credentials** — doc 01, 2026-07-17 amendment; SSR bakes the authoritative `API_BASE_URL` into the DOM; a proxy route buys nothing — drop-in later if origin-hiding wanted): validate (nombre/apellido present, email-or-phone, empresa name when Empresa) → read `cf-turnstile-response` → payload `{ firstName, lastName, phone?, email?, clientType, businessName?, comments?, turnstileToken }` + stored attribution falling back to current-URL params **run through `sanitize-attribution` (doc 02 CP-1)**, **flattened to top-level `utmSource/…/landingPage`** → POST **with `credentials: 'include'`** (the 201 sets the HttpOnly `lead_submitted` dedup cookie; without credentials the browser never stores/sends it) → 201: success block ("¡Gracias! Te contactaremos pronto."); **429 `already_submitted`**: already-received block ("Hemos recibido tu solicitud - Pronto nos pondremos en contacto contigo"), no retry; **429 `rate_limited`**: "Espera un momento e intenta de nuevo." + turnstile reset; other failure: inline error + **`window.turnstile?.reset()`** (single-use tokens — without reset every retry 403s); disable submit in flight.

## CP-3 — CTA retarget + e2e

- [ ] `Header.astro` — CTA → `/contact-us`; navLinks → `/#servicios` etc. so they work from the new page; scroll-spy `data-target={href.slice(1)}` → parse `href.split('#')[1]` (observer already no-ops on pages without sections).
- [ ] `Hero.astro`, `Services.astro`, `Clients.astro` — CTA `#contacto` → `/contact-us`. **Footer untouched** (keeps `id="contacto"` direct-channel block).
- [ ] E2E: `npm run dev` → `http://localhost:4321/?utm_source=facebook&utm_medium=social` → "Cotiza ahora" → `/contact-us` → submit → success; row shows `source=facebook`, `utm_source='facebook'`, `landing_page='/'`. Without utm → `source=website`. `npm run preview` to exercise real Workers runtime vars. Paste a superadmin share link against the running site to close the loop.

## Risks / notes

- sessionStorage first-touch = per-tab; returning visitors fall back to `source=website`. Accepted.
- gclid/fbclid-only clicks (no `utm_source`) don't persist attribution and map to `source=website` — acceptable; links minted by the share-links page always carry `utm_source`.
- Turnstile widget reset after failed submits is mandatory (single-use tokens).
- The client-side attribution filter is bypassable by construction (public endpoint) — the backend sanitizer (doc 01 CP-2) is the enforcing layer; keep both in sync if the rules ever change.
- Abuse gates live in the backend (doc 01, 2026-07-17): dedup cookie (7-day dial) + 1 req/min per-IP throttle. The form only needs `credentials: 'include'` and friendly handling of the two 429 codes above.
