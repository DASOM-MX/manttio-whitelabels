# Whitelabel 01 — Backend brand source (PR-A)

> **Status:** planned · **Last updated:** 2026-07-11 · **PR:** PR-A
> **Part of:** `.claude/plans/field-app-whitelabeling/` (see `00-master` for the canonical
> Branding rules, shared brand contract, current reality, and de-brand inventory).
> **Owner:** branch `feature/fullstack-whitelabel-branding`.

Build the backend brand source the whole suite depends on, de-hardcode the render paths, migrate
the current Peña values into data, and clear the website's residual literals. **Independently
valuable: this alone lights up the already-built website against a real `/brand` + `/fonts`.**

Governed by `00-master` → Branding rules (esp. HSL/no-hex/0–1000, backend-provided fallback,
one-deploy-per-tenant, server-side materialization). Enums are **TS enums** (`z.nativeEnum` +
`.$type<>()` — repo convention).

## 1. `modules/brand/` (net-new, module-first per `backend/CLAUDE.md`)

### 1.1 Table + migration (single row, direct-apply, no draft)
`brand` table (next migration after `0013`). Store the **two seed colors** (HSL, no hex) and
materialize on read — keep the seed the sole source (recommend store `primary_hsl` + `surface_hsl`
and ramp to the **0…1000** scale on read so a re-tint change needs no backfill). Columns:
`id` (single-row guard), `name`, `slogan?`, `description?`, `logo_key?`, `logo_dark_key?`,
`isologo_key?`, `favicon_key?`, icon/maskable set (for the PWA manifest, `02`), `primary_hsl`,
`surface_hsl`, `contact` (jsonb), `social` (jsonb), `font_body?`, `font_heading?`, timestamps.
**No `tenant_id`** (one deploy = one tenant).

### 1.2 Endpoints (mount `GET /brand` + `GET /fonts` BEFORE the JWT guards, like `/public/cms`)
- `GET /brand` — **public**, returns the materialized `Brand` (master → Shared brand contract):
  ramp `primary_hsl`/`surface_hsl` → **0…1000 HSL** scales (vary lightness across the stops);
  `*_key` → `cdnUrl(CDN_BASE_URL, key)`; assemble contact/social/font. Fail-soft is the client's
  job (both apps already default).
- `GET /fonts` — **public**, a curated OFL catalog (constants-only `FontCatalogEntry[]`, woff2
  URLs on the CDN/R2). Matches what the website already resolves against.
- `PUT /brand` — **JWT + owner** (`requireRole(['owner'])`), upsert the single row, direct-apply
  (no publish step). Second writer: the manager's shared-token provisioning push (out of scope;
  note the seam).

### 1.3 De-hardcode the render paths (supersede `BRAND_*` — CLAUDE.md rule)
- **Email** (`reports/services/report-email.service.ts` + `helpers/report-email.helpers.ts` +
  `templates/report-email.html.ts`): read brand from the DB at render time, not `c.env.BRAND_*`.
  Fix the literal subject `Reporte de servicio ${folio} – Peña Nevada Chillers` → `brand.name`.
  Email HTML colors → `brand.colors.primary`. **`RESEND_FROM = no-reply@<whitelabel-domain>.com`**
  (per-deploy infra, derived from the tenant domain, not the brand row); email **display name** =
  `brand.name` (→ `"<brand.name>" <no-reply@<domain>>`).
- **PDF** (`pdf/constants/pdf-layout.ts` — the `backend/CLAUDE.md`-flagged per-client seam):
  colors/logo from brand at render time.
- **`wrangler.toml`:** `BRAND_NAME`/`BRAND_SITE_URL`/`BRAND_LOGO_URL` become the **seed** (§2),
  then drop from `[vars]`. `CDN_BASE_URL`, `API_BASE_URL`, `RESEND_FROM` **stay** (infra). Fix the
  dev gap: `API_BASE_URL` is only in `[env.production.vars]` — add to top-level `[vars]`/`.dev.vars`.

### 1.4 Explicitly descoped
No `TenantCacheDO`, no `tenant_id`, no cross-tenant host resolution. Brand read hits Neon per
request (as the website already does, uncached). **Optional** later: wrap `GET /brand` in the CF
`Cache API` with short TTL — noted, not built (brand is hot: every app boot + site visit).

## 2. Seeding the current tenant (Peña as data)
- One-time seed of the `brand` row from today's values: `name='Peña Nevada Chillers'`,
  `primary_hsl`/`surface_hsl` = the current navy/granite bases (from `website/PLAN.md`) **converted
  to HSL** (no hex stored), contact from `PUBLIC_CONTACT_*`, and **upload the current logo assets
  to R2** (`penanevada-*` from `website/public/brand/` + `frontend/src/assets/logo.jpg`) → set
  `*_key`s.
- After seeding, Peña renders identically — but every surface now reads the row, so the same infra
  serves a different tenant by swapping the row + assets + `API_BASE_URL`.

## 3. Website residuals (folded into this PR)
- `website/wrangler.jsonc` worker `name: "pena-nevada-website"` → neutral (tenant-suffixed at deploy).
- **Color-model migration:** the website is currently **hex, steps 50–950** (`theme.ts`
  `hexToTriplet` → `rgb(var(...))`). Migrate to the shared contract — **HSL, steps 0…1000**
  (`hsl(var(--brand-…) / <alpha-value>)`, var = `H S% L%`); remap its `-50/-950` Tailwind utilities
  → `-0/-1000`.
- Strip the Peña hexes from `tailwind.config.mjs` `var()` fallbacks → minimal neutral grayscale;
  `/brand` supplies the real default palette. Comments (`tailwind.config.mjs`, `.env.example`)
  mentioning Peña → generic.

## Checkpoints
### CP-1 — Table + endpoints
- [ ] `brand` table + migration; TS-enum any enums
- [ ] `GET /brand` + `/fonts` (public) + `PUT /brand` (owner)
- [ ] Color materialization (2 HSL seeds → 0…1000 for `primary` + `surface`, incl. the neutral
      default), key → CDN URL; `Brand` DTO === master's shared contract

### CP-2 — De-hardcode render paths
- [ ] Email subject + colors and PDF read brand at render (no `env.BRAND_*`)
- [ ] `RESEND_FROM = no-reply@<domain>`, display name `brand.name`
- [ ] Migrate `wrangler.toml` `BRAND_*` → brand row (drop from vars); dev `API_BASE_URL` gap fixed

### CP-3 — Seed + verify
- [ ] Seed the current tenant's row (§2); logo assets uploaded to R2
- [ ] Email + PDF render unchanged for Peña
- [ ] Grep clean of **backend** literals (`pe[ñn]a nevada`, `penanevadachillers`) except seed/data
      + the generic "chillers" noun

### CP-4 — Website residuals + light-up
- [ ] Worker name neutral; website color model migrated to HSL / 0…1000 (`-50/-950` → `-0/-1000`)
- [ ] Peña fallbacks stripped → neutral grayscale
- [ ] Website renders against the real `/brand` + `/fonts`; website literals grep-clean

## Open decisions (this plan)
- **Font catalog contents:** `/fonts` needs a curated OFL list + hosted woff2s. Which families
  beyond the two defaults (Rubik/Work Sans, already self-hosted)? Can ship with just the two and
  grow the catalog later.
- **Color materialization / tint:** model is fixed (HSL, 0…1000, no hex); tenant picks 2 HSL seeds
  and the backend ramps **lightness** across the 11 stops (same ramp yields the neutral default).
  Open: the exact L stops, whether `0` is lightest or darkest, and whether the ramp also nudges S.
  Reference: adapt the website's materializer (hex/50–950 today).
