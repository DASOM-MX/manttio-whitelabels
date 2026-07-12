# Whitelabel — De-brand + runtime tenant branding (full stack)

> **Status:** planned (decisions locked 2026-07-10)
> **Scope decisions (2026-07-10):** (1) **full stack in this plan** — build the backend
> brand source *and* the field-app consumption; (2) **one deployment per tenant** — single-row
> brand table, tenant = which backend a deploy points at, **no `tenant_id` columns, no
> Durable Object**; (3) **dynamic manifest route** — the PWA manifest is served fresh at
> runtime, not baked per deploy.
> **Depends on / references:** `website/` already implements the target pattern
> (`website/src/lib/{api,types,theme}.ts`, `website/tailwind.config.mjs`) — **the website's
> `Brand`/`FontCatalogEntry` types are the canonical contract this plan implements on the
> backend and mirrors in the field app.** Backend design origin:
> `backend/manttio-whitelabeled-backend-plan.md` §3 (brand table), §5/§6 (cache — **descoped
> here**). Root `CLAUDE.md` → "Whitelabel de-branding (fork rule)" is the governing rule.
> **Owner:** branch `feature/fullstack-whitelabel-branding` (worktree
> `../manttio-whitelabeled-worktrees/whitelabel-branding`, off `main`) · **Last updated:** 2026-07-11

Two halves, one PR series: **de-brand** (remove every hardcoded Peña Nevada literal from
shipped code/config) and **re-brand at runtime** (each app pulls its identity from the backend
brand object, the way `website/` already does). The website is the reference implementation and
already ~done; the **backend brand source and the field-app (`frontend/`) consumption are
net-new** and are the bulk of this work.

> **Guiding principle — Peña becomes *data*, not code (not deletion).** De-branding does not
> erase Peña Nevada; it **moves** it out of source and into the brand table as the *current
> tenant's row* (seeded from today's wrangler vars + logo assets uploaded to R2). Nothing
> renders Peña from a literal anymore, but the running Peña deployment looks identical because
> its brand row carries the same values. This is why the `wrangler.toml` `BRAND_*` are a
> **migration, not a blind delete** (per the CLAUDE.md rule).

---

## Branding rules (canonical)

Settled invariants — they govern every PR in this plan; treat them as fixed, not per-PR choices.

1. **One shared brand contract.** Backend `GET /brand` + `GET /fonts` emit exactly the
   `Brand` / `FontCatalogEntry` types in §1; the website and field app both consume that shape.
   Never fork a second brand shape.
2. **Color model = HSL, no hex, scale steps 0–1000** (11 stops by 100). Values are `H S% L%`
   components; CSS output is `hsl(var(--brand-<scale>-<step>) / <alpha-value>)`. Two logical
   scales only: `primary`, `surface`. **No hex anywhere** — not in the brand table, the `/brand`
   payload, or the emitted CSS.
3. **The default/fallback palette comes from the backend.** `/brand` always returns a
   materialized palette (tenant custom or a backend-provided neutral default). Apps must **not**
   bake brand hexes as `var()` fallbacks — only a minimal neutral grayscale for the pre-fetch
   instant.
4. **Brand is data, not code.** No hardcoded brand literal in shipped code/config; Peña Nevada
   becomes the current tenant's brand row (§7). The generic HVAC noun "chillers" is not brand.
5. **Absent identity hides, never fakes.** A missing logo/contact/social field renders nothing
   (no placeholder) — the website's rule, app-wide.
6. **Materialize server-side.** Logos arrive as finished CDN URLs (backend maps keys →
   `cdnUrl`); fonts arrive as catalog codes resolved against `/fonts`. Clients never see keys or
   raw single colors.
7. **Email sender:** `RESEND_FROM = no-reply@<whitelabel-domain>.com` (per-deploy infra); email
   display name = `brand.name`.
8. **Tenancy = one deployment per tenant.** Single-row brand table, tenant = which backend a
   deploy points at. No `tenant_id` columns, no cross-tenant resolution, no Durable Object.

---

## 0. Current reality (from exploration 2026-07-10)

- **Backend:** no `brand` table, no `GET /brand`, no `GET /fonts`, no DO. Brand lives as
  hardcoded `wrangler.toml` vars (`BRAND_*`, `RESEND_FROM`, `CDN_BASE_URL`, domains) consumed
  only by the report-email module; the email **subject** hardcodes the literal
  `"Peña Nevada Chillers"` (bypasses even `BRAND_NAME`); email HTML + PDF theme colors are
  hardcoded hex. DB is **single-tenant** (no `tenant_id` anywhere; CMS keyed by `section`/`id`).
- **Website:** already fetches `GET /brand` + `/fonts` (+ CMS) SSR, fail-soft to neutral
  defaults, applies colors via a request-time `:root{}` inline style over Tailwind
  `rgb(var(--brand-…, <fallback>) / <alpha-value>)`. It currently always hits the fallback
  because `/brand` 404s (unbuilt). Residual literal: worker name `pena-nevada-website`.
- **Field app (`frontend/`):** **zero** runtime brand machinery — compile-time hex palette
  (`tailwind.config.js` + PrimeNG `manttio-preset.ts`), brand literals in `manifest.webmanifest`,
  `index.html` (`apple-mobile-web-app-title`), a `_index.scss` comment, and the login
  `assets/logo.jpg`. Its palette hexes are **byte-identical to the website's fallback palette**
  (two logical scales: `primary`, `surface`) → the website's CSS-var repoint technique ports over
  (retargeted to HSL / 0–1000 per the Branding rules). It
  already has a `provideAppInitializer` hook and an `app.ts` `effect()` that mutates
  `<html>`/`theme-color` — the natural boot-fetch + apply seams.

---

## 1. Shared brand contract (canonical: `website/src/lib/types.ts`)

The backend `GET /brand` **must emit exactly** the shape the website already consumes; the field
app mirrors the same types. Do not invent a second shape.

```ts
interface BrandColorScale { [step: string]: string; }        // '0'…'1000' by 100 → HSL components "H S% L%" (no hex), materialized server-side
interface Brand {
  name: string; slogan?: string; description?: string;
  logoUrl?: string; logoDarkUrl?: string; isologoUrl?: string;   // resolved CDN URLs (backend maps keys → cdnUrl)
  colors?: { primary?: BrandColorScale; surface?: BrandColorScale };
  contact?: { phone?: string; whatsapp?: string; email?: string; address?: string };
  social?: { facebook?: string; instagram?: string; tiktok?: string; [k: string]: string | undefined };
  font?: { body?: string; heading?: string };                    // catalog codes, e.g. 'work_sans'
}
interface FontCatalogEntry { code: string; label: string; files: { variable?: string }; fallbackStack?: string; }
```

Key properties: colors are **full HSL scales** — steps **`0`…`1000` by 100**, values as `H S% L%`
components (**no hex anywhere in the brand contract**), materialized server-side; logos are
**finished CDN URLs** (no keys on the client); fonts are **catalog codes** resolved against
`/fonts`. Identity fields that are absent **hide** in the UI (never render fake placeholders) —
the website's rule, adopted app-wide.

> **Color model (decided 2026-07-11): HSL, no hex, scale steps 0–1000 (11 stops by 100).** This
> **diverges from the website's current impl** (hex, steps 50–950), so the website migrates to
> this contract in PR-A (§5). CSS output is `hsl(var(--brand-<scale>-<step>) / <alpha-value>)`
> with each var holding the `H S% L%` triplet.

---

## 2. Backend — `modules/brand/` (net-new)

Module-first layout per `backend/CLAUDE.md`. **Enums are TS enums** (string-valued,
`z.nativeEnum` + `.$type<>()` — repo convention, not const-array unions).

### 2.1 Table + migration (single row, direct-apply, no draft)
`brand` table (next migration after `0013`). Store the **two seed colors** (HSL, no hex) the
tenant picks and materialize the scales on read — keep the seed the sole source (recommend store
`primary_hsl` + `surface_hsl` and ramp to the **0…1000** scale on read so a re-tint change needs no
backfill). Columns: `id` (single-row guard), `name`, `slogan?`, `description?`, `logo_key?`,
`logo_dark_key?`, `isologo_key?`, `favicon_key?`, icon/maskable set (for the PWA manifest, §4),
`primary_hsl`, `surface_hsl`, `contact` (jsonb), `social` (jsonb), `font_body?`, `font_heading?`,
timestamps. **No `tenant_id`** (decision 2: one deploy = one tenant).

### 2.2 Endpoints (mount `GET /brand` + `GET /fonts` BEFORE the JWT guards, like `/public/cms`)
- `GET /brand` — **public**, returns the materialized `Brand` (§1): ramp `primary_hsl`/
  `surface_hsl` → **0…1000 HSL** scales (vary lightness across the stops); `*_key` →
  `cdnUrl(CDN_BASE_URL, key)`; assemble contact/social/font. Fail-soft is the client's job (both
  apps already default).
- `GET /fonts` — **public**, a curated OFL catalog (constants-only `FontCatalogEntry[]`, woff2
  URLs on the CDN/R2). Matches what the website already resolves against.
- `PUT /brand` — **JWT + owner** (`requireRole(['owner'])`), upsert the single row, direct-apply
  (no publish step). Second writer: the manager's shared-token provisioning push (out of scope
  here; note the seam).

### 2.3 De-hardcode the render paths (supersede `BRAND_*` — CLAUDE.md rule)
- **Email** (`reports/services/report-email.service.ts` + `helpers/report-email.helpers.ts` +
  `templates/report-email.html.ts`): read brand from the DB at render time, not `c.env.BRAND_*`.
  Fix the literal subject `Reporte de servicio ${folio} – Peña Nevada Chillers` → use
  `brand.name`. Email HTML colors → `brand.colors.primary`. **`RESEND_FROM` is always
  `no-reply@<whitelabel-domain>.com`** (decision 2026-07-11) — per-deploy infra derived from the
  tenant domain, not the brand row; the email **display name** uses `brand.name`
  (→ `"<brand.name>" <no-reply@<domain>>`).
- **PDF** (`pdf/constants/pdf-layout.ts` — the `backend/CLAUDE.md`-flagged per-client seam):
  colors/logo from brand at render time.
- **`wrangler.toml`:** `BRAND_NAME`/`BRAND_SITE_URL`/`BRAND_LOGO_URL` become the **seed** for the
  brand row (§7), then drop from `[vars]` (email/PDF no longer read them). `CDN_BASE_URL`,
  `API_BASE_URL`, `RESEND_FROM` **stay** (infra, per-deploy). Fix the dev gap: `API_BASE_URL` is
  only in `[env.production.vars]` — add to top-level `[vars]`/`.dev.vars` (flagged in exploration).

### 2.4 Explicitly descoped (decision 2)
No `TenantCacheDO`, no `tenant_id` columns, no cross-tenant host resolution. Brand read hits Neon
per request (as the website already does, uncached). **Optional** later: wrap `GET /brand` in the
CF `Cache API` with short TTL — noted, not built (brand is hot: every app boot + site visit).

---

## 3. Field app (`frontend/`) — runtime theming

The website is **SSR** (injects `:root` vars server-side); the field app is a **client PWA**, so
"as website does" translates to: fetch at boot → apply CSS custom properties from JS. The palette
is byte-identical to the website's, so the mechanism ports directly.

### 3.1 Contract + service + state
- `src/app/data/dtos/brand/` — mirror the §1 `Brand` + `FontCatalogEntry` types.
- `src/http/brand.service.ts` — `remote.get<Brand>('/brand')`, `remote.get<FontCatalogEntry[]>('/fonts')`
  (mirror `customers.service.ts`). Public endpoints; the auth interceptor attaching a JWT is
  harmless.
- `src/state/brand/` — mirror `src/state/app/`. `BrandStateModel { brand: Brand | null; fonts:
  FontCatalogEntry[]; loaded: boolean }`; `LoadBrand` action as an **RxJS pipeline**
  (`from(...)`/`switchMap`/`tap`/`catchError`, no async). **Persist via the storage-plugin `keys`**
  (add `'brand'`) so the last brand paints instantly on the next boot (and offline) — then
  `LoadBrand` refreshes in the background. No flash after first run.

### 3.2 Boot + apply
- `app.config.ts` `provideAppInitializer`: dispatch `LoadBrand()` (fire-and-forget; the persisted
  brand already applied from cache, so bootstrap isn't blocked). Register `BrandState` in
  `provideStore([...])`.
- `app.ts` apply-`effect()` (extends the existing dark-mode effect): on `select(BrandState.brand)`
  →
  1. inject/replace `<style id="brand-vars">` with `:root { --brand-primary-0..1000; --brand-surface-0..1000; --brand-font-*; }` + any non-default `@font-face` — **port `website/src/lib/theme.ts::buildBrandCss`** into a pure `src/app/theme/brand-css.ts`, **emitting `H S% L%` components (not hex/RGB)**;
  2. `setAttribute` the favicon `<link>` href (`brand.isologoUrl`), apple-touch-icon,
     `apple-mobile-web-app-title` (`brand.name`), `theme-color` meta (brand primary, replacing
     the hardcoded `THEME_COLOR = { light:'#243345', dark:'#131717' }` — derive light/dark from
     the primary scale), and `document.title`;
  3. the login logo `auth/pages/login/login.html` `assets/logo.jpg` → `[src]="brand.logoUrl"`
     (guarded; hide when absent).

### 3.3 Palette → CSS vars (the byte-identical port)
- `tailwind.config.js`: rewrite `colors` to
  `hsl(var(--brand-<scale>-<step>, <neutralHslTriplet>) / <alpha-value>)` (the var holds `H S% L%`).
  **Scale steps become `0`…`1000` by 100** — remap existing endpoint utilities across templates +
  `styles.scss`/`theme/*.scss`: **`-50 → -0`, `-950 → -1000`** (interior `100`–`900` unchanged).
  Map `granite → surface`,
  `navy/sky/cyan → primary` (same as website); repoint the semantic tokens
  (`background/surface/primary/secondary/dark`) to the same vars. **The default palette comes from
  the backend** (decision 2026-07-11): `/brand` always returns a materialized palette (tenant
  custom or a backend-provided neutral default), so **do not bake the Peña hexes as fallbacks** —
  the `var()` fallback is a minimal neutral grayscale, exposed only in the pre-fetch instant of a
  first-ever offline boot (after first run the persisted brand applies immediately). Because
  `styles.scss` + `theme/*.scss` use `@apply` of these palette utilities, they follow brand
  automatically — **no per-class edits**.
- PrimeNG `manttio-preset.ts`: its semantic `primary`/`surface` scales use raw hex → change to
  `hsl(var(--brand-primary-<step>))` / `hsl(var(--brand-surface-<step>))` at steps `0`…`1000` (no
  `<alpha-value>` placeholder — PrimeNG tokens don't consume it) so PrimeNG chrome tracks brand
  too. Verify dark mode still keys off `.app-dark`.

---

## 4. PWA identity — dynamic manifest route (decision 3)

The SW prefetches `manifest.webmanifest` + icons as statics; runtime JS can't swap them. So serve
the manifest **fresh at runtime**:

- **Manifest route:** a **Cloudflare Pages Function** on the frontend host
  (`frontend/functions/manifest.webmanifest.ts`, same-origin, correct `application/manifest+json`)
  that fetches `GET {API_BASE_URL}/brand` and returns a brand-driven manifest (`name`,
  `short_name`, `description`, `theme_color` from brand primary, `background_color`, and `icons`
  pointing at brand icon CDN URLs). Fail-soft to a neutral manifest if `/brand` is unavailable.
- **`index.html`:** `<link rel="manifest" href="/manifest.webmanifest">` now resolves to the
  function; drop the literal `apple-mobile-web-app-title` (runtime sets it, §3.2).
- **Service worker (`ngsw-config.json`):** **remove `/manifest.webmanifest` from the `app`
  prefetch group** so the SW doesn't pin a stale static manifest (it currently prefetches it).
  Brand icons come from the CDN by URL (not the bundled `icons/*`), so the browser/`assets` lazy
  group handles them; keep a neutral bundled fallback icon set for the no-brand path.
- **Caveat to document:** browsers cache the manifest; the installed-app identity refreshes on the
  next manifest fetch, and an already-installed home-screen icon only updates on reinstall — an
  accepted limitation of any dynamic-manifest approach.

---

## 5. Website (`website/`) — residual cleanup (mostly done)

The runtime pattern is already built; this plan only (a) makes it *light up* by shipping the
backend `/brand` + `/fonts` (§2), and (b) clears residual literals:
- `website/wrangler.jsonc` worker `name: "pena-nevada-website"` → neutral (e.g. tenant-suffixed at
  deploy).
- `defaults.ts` is already neutral (`'Climatización Industrial'`, no logos/contact). **Fallback
  palette now comes from the backend** (decision 2026-07-11) — strip the Peña hexes from the
  `tailwind.config.mjs` `var()` fallbacks down to a minimal neutral grayscale; `/brand` supplies
  the real default palette.
- **Color-model migration (2026-07-11):** the website is currently **hex, steps 50–950**
  (`theme.ts` `hexToTriplet` → `rgb(var(...))`). Migrate it to the shared contract — **HSL, steps
  0…1000** (`hsl(var(--brand-…) / <alpha-value>)`, var = `H S% L%`) and remap its `-50/-950`
  Tailwind utilities to `-0/-1000`. One color contract across all three apps.
- Comments in `tailwind.config.mjs` / `.env.example` mentioning Peña → generic.

---

## 6. De-brand inventory (the exact literals)

Cross-references the CLAUDE.md rule's list. **Brand literals to remove/migrate** (NOT the generic
HVAC noun "chillers", which stays — e.g. `website/src/lib/defaults.ts` marketing copy):

| App | File | Literal | Resolution |
|---|---|---|---|
| frontend | `public/manifest.webmanifest` | name/short_name/description/theme_color | replaced by §4 dynamic route |
| frontend | `src/index.html` | `apple-mobile-web-app-title="Peña Nevada"` | runtime-set (§3.2) |
| frontend | `src/theme/_index.scss` | comment | reword |
| frontend | `src/assets/logo.jpg` | bundled brand logo | → `brand.logoUrl` (keep a neutral bundled fallback) |
| backend | `reports/helpers/report-email.helpers.ts` | subject literal | `brand.name` (§2.3) |
| backend | `reports/templates/report-email.html.ts` + `pdf/constants/pdf-layout.ts` | hardcoded colors/logo | brand at render (§2.3) |
| backend | `wrangler.toml` | `BRAND_*` | **migrate to brand row** then drop; infra vars stay (§2.3, §7) |
| website | `wrangler.jsonc` | worker name | neutral (§5) |

---

## 7. Seeding the current tenant (Peña as data)

- Build a one-time seed for the existing deployment's `brand` row from today's values:
  `name='Peña Nevada Chillers'`, `primary_hsl`/`surface_hsl` = the current navy/granite bases
  (from `website/PLAN.md`) **converted to HSL** (no hex stored), contact from
  `PUBLIC_CONTACT_*`, and **upload the current logo assets to R2** (`penanevada-*` from
  `website/public/brand/` + `frontend/src/assets/logo.jpg`) → set `*_key`s.
- After seeding, the Peña deployment renders identically — but every surface now reads the row, so
  the same infra can serve a different tenant by swapping the row + assets + `API_BASE_URL`.

---

## Checkpoints & suggested PR split

**Three PRs (decided 2026-07-11).** The de-brand sweep is **not** a trailing PR — its backend +
website parts fold into PR-A (the endpoints PR); its frontend/manifest literals ride PR-B/PR-C as
their runtime replacements land (a literal can't be removed before the thing that replaces it
exists).

**PR-A — Backend brand source + de-brand (§2, §5, §6, §7)**
- [ ] `brand` table + migration; TS-enum any enums; `GET /brand` + `/fonts` (public) + `PUT /brand` (owner)
- [ ] Color materialization (2 **HSL** seeds → **0…1000** scales for `primary` + `surface`, incl. the backend-provided neutral default), key → CDN URL, `Brand` DTO === website contract
- [ ] De-hardcode email (subject + colors) + PDF; migrate `wrangler.toml` `BRAND_*` → brand row (drop from vars); `RESEND_FROM = no-reply@<domain>` (display name `brand.name`); dev `API_BASE_URL` gap fixed
- [ ] Seed the current tenant's row (§7); verify email/PDF unchanged for Peña
- [ ] Website residuals: worker name neutral; **migrate website color model to HSL / 0…1000** (`theme.ts` + `tailwind.config.mjs`, remap `-50/-950` → `-0/-1000`); strip Peña fallbacks → neutral grayscale; website lights up against real `/brand`/`/fonts`
- [ ] Grep clean of **backend + website** literals (`pe[ñn]a nevada`, `penanevadachillers`) except intentional seed/data + the generic "chillers" noun

**PR-B — Field-app runtime theming + de-brand (§3, §6)**
- [ ] `brand` DTO + `brand.service.ts` + `BrandState` (persisted) + boot `LoadBrand`
- [ ] `tailwind.config.js` + `manttio-preset.ts` CSS-var repoint (**HSL**, steps **0…1000**; remap `-50/-950` → `-0/-1000`; neutral grayscale `var()` fallback; palette from `/brand`)
- [ ] `app.ts` apply effect (vars, favicon, theme-color, apple title, document title, login logo → `brand.logoUrl`)
- [ ] Remove frontend brand literals now replaced at runtime (`index.html` apple title, `_index.scss` comment)
- [ ] Build green; light + dark still correct; no-brand path renders the neutral default (no flash)

**PR-C — PWA dynamic manifest + de-brand (§4, §6)**
- [ ] Pages Function `manifest.webmanifest` from `/brand`; `index.html` link; SW prefetch of the static manifest removed
- [ ] Neutral bundled fallback icon set; install shows tenant name/icon; document the cache caveat
- [ ] Static `manifest.webmanifest` brand literals gone (superseded by the route)

---

## Open decisions / asks
- **Locked decisions** are consolidated in **Branding rules (canonical)** above (shared contract,
  HSL/no-hex/0–1000 color model, backend-provided fallback, absent-hides, server-side
  materialization, `RESEND_FROM`, one-deploy-per-tenant) plus scope: full-stack in this plan ·
  dynamic manifest route.
- **PR granularity (decided 2026-07-11):** **three PRs** — the de-brand sweep folds into PR-A
  (the branding-endpoints PR); frontend/manifest literals ride PR-B/PR-C as those land. PR-A
  unblocks the website immediately and is independently valuable.
- **Font catalog contents (open):** `/fonts` needs a curated OFL list + hosted woff2s. Which
  families beyond the two defaults (Rubik/Work Sans, already self-hosted)? Backend ask.
- **Color materialization / tint (open):** model is fixed (rule 2 — HSL, 0…1000, no hex); the
  tenant picks 2 HSL seeds and the backend ramps **lightness** across the 11 stops (same ramp
  yields the neutral default). Still open: the exact L stops, whether `0` is lightest or darkest,
  and whether the ramp also nudges S. Reference: adapt the website's materializer (hex/50–950 today).
- **PWA icon assets (open):** the dynamic manifest needs sized + maskable icons (192/512) per
  tenant. Does the tenant upload a full icon set, or does the backend/build generate them from the
  uploaded isologo (needs image processing)? Today's `icons/*` are static Peña assets.
