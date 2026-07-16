# utm-params 02 — Website connection (contact page + form + capture)

> **Status:** not-started · **Depends on:** [01-fullstack-implementation](01-fullstack-implementation.md) CP-2 (the `POST /public/leads` endpoint)
> **Owner:** — · **Last updated:** 2026-07-16
> **PR:** PR-B `feat(website)` on branch `feature/website-contact-form` (created after PR-A merges) · base `main`

Uga, friend. Shared context + decisions carved in rock live at top of [01-fullstack-implementation](01-fullstack-implementation.md) — this tablet patiently waits for that tablet's CP-2.

Facts about website cave, so builder not surprised: SSR per-request on Workers (`prerender = false`), plain `<script>` blocks with `data-*` hooks (no framework in cave), Tailwind 3.4 only + brand CSS vars, no `<form>`/`<input>` precedent anywhere (styling is net-new, built from tokens: granite borders, cyan focus ring), copy is es_MX, no inline `style=` ever, anime.js for animations only.

## CP-1 — Attribution capture + env plumbing

Grug remember first footprint, gently.

- [ ] `src/components/UtmCapture.astro` — markup-less; on load, if no `sessionStorage['lead-attribution']` (**first touch only — later footprints politely declined**) and `utm_source` present in `location.search`: store `{ params (source/medium/campaign/term/content/gclid/fbclid), referrer, landingPage: location.pathname, ts }`; wrap in try/catch (storage disabled → form fall back to current-URL params, no crash). Include on `index.astro`.
- [ ] `src/lib/runtime-env.ts` — `resolveRuntimeVar(name, publicFallbackKey)` following the `resolveBaseUrl` pattern (`api.ts:27-40`); also export `resolveBaseUrl` from `lib/api.ts`.
- [ ] `wrangler.jsonc` — add `vars.TURNSTILE_SITE_KEY` (per-tenant deploy value like `API_BASE_URL`; site key is public thing, not secret). Local `.env` (uncommitted, tribe law on `.env*`): `PUBLIC_API_BASE_URL=http://127.0.0.1:8787`, `PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` (always-pass test key); document both in `.env.example`.

## CP-2 — `/contact-us` page + form

Grug build new cave where prospect leave message.

- [ ] `src/pages/contact-us.astro` — `prerender = false`; frontmatter mirror `index.astro` (getSiteData, buildBrandCss, canonical/OG meta, title `${brand.name} — Contacto`) + `apiBase = await resolveBaseUrl()` + `siteKey = await resolveRuntimeVar(...)`. Head: `<script is:inline src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer>`. Body: Header → compact dark page-header band ("Contáctanos / …") → ContactForm → Footer → UtmCapture.
- [ ] `src/components/ContactForm.astro` — props `{ apiBase, siteKey, brand }`. If apiBase or siteKey null → kindly render direct-channel fallback (tel/mailto buttons from `brand.contact`) instead of dead form — dead form make prospect sad. Fields: **nombre\* / apellido\*** / teléfono / email (helper "Proporciona al menos un correo o teléfono") / **tipo de cliente\* radio Persona|Empresa** (`person|business`) / **nombre de la empresa\*** — hidden until Empresa selected, then required (small `<script>`-toggled reveal, `hidden` class + `required` attr kept in sync) / **comentarios** textarea (optional) / implicit-render `<div class="cf-turnstile" data-sitekey={siteKey}>`; submit `bg-cyan-500 hover:bg-cyan-600`; real `<label for>` + `autocomplete` on everything; Spanish inline errors. Root: `data-contact-form data-api-base={apiBase}`.
- [ ] Client script — **direct browser POST** to `${apiBase}/public/leads` (backend CORS already wildcard; SSR bake authoritative `API_BASE_URL` into DOM; proxy route would add hop and buy nothing — drop-in later if origin-hiding ever wanted): validate (nombre/apellido present, email-or-phone, empresa name when Empresa) → read `cf-turnstile-response` → payload `{ firstName, lastName, phone?, email?, clientType, businessName?, comments?, turnstileToken }` + stored attribution falling back to current-URL params, **flattened to top-level `utmSource/…/landingPage`** → POST → on 201: swap form for success block ("¡Gracias! Te contactaremos pronto."); on failure: inline error + **`window.turnstile?.reset()`** (token single-use — without reset every retry 403 and prospect very sad); disable submit while in flight.

## CP-3 — CTA retarget + e2e

Grug point all buttons at new cave, then walk whole path himself.

- [ ] `Header.astro` — CTA → `/contact-us`; navLinks → `/#servicios` etc. so they work from new page; scroll-spy `data-target={href.slice(1)}` → parse `href.split('#')[1]` instead (observer already no-op on pages without those sections).
- [ ] `Hero.astro`, `Services.astro`, `Clients.astro` — CTA `#contacto` → `/contact-us`. **Footer untouched** (keep `id="contacto"` direct-channel block — prospect who prefer phone still welcome).
- [ ] E2E: `npm run dev` → `http://localhost:4321/?utm_source=facebook&utm_medium=social` → "Cotiza ahora" → `/contact-us` → submit → success; row show `source=facebook`, `utm_source='facebook'`, `landing_page='/'`. Without utm → `source=website`. Also `npm run preview` to exercise real Workers runtime vars. Finally paste superadmin share link against running site — circle complete, tribe rejoice.

## Risks / notes (tribe should know)

- sessionStorage first-touch = per-tab; visitor who return tomorrow via bookmark fall back to `source=website`. Accepted, carved in rock.
- gclid/fbclid-only clicks (no `utm_source`) not persist attribution and map to `source=website` — acceptable; links minted by share-links page always carry `utm_source`.
- Turnstile widget reset after failed submit is mandatory (single-use tokens).

Thank you for reading tablet. Uga.
