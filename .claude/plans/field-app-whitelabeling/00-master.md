# Whitelabel — De-brand + runtime tenant branding (master)

> **Status:** suite implemented 2026-07-12 — 01 (PR-A: **no seed**, manager shared-token push;
> contract gained `siteUrl?`) · 02 CP-1 (PR-B: field-app runtime theming) · 02 CP-2 (PR-C:
> dynamic manifest; **backend-generated icon set** in the dedicated `manttio-logos` bucket,
> contract gained `icons?`) · **Last updated:** 2026-07-12
> **Suite:** `.claude/plans/field-app-whitelabeling/` — this master + two build plans:
> **`01-brand-backend`** (backend brand source, PR-A) · **`02-brand-frontend`** (field-app
> runtime theming + dynamic PWA manifest, PR-B + PR-C).
> **Scope decisions (2026-07-10):** full-stack across the suite · one-deployment-per-tenant
> (no `tenant_id`, no DO) · dynamic manifest route.
> **References:** `website/` already implements the target pattern
> (`website/src/lib/{api,types,theme}.ts`, `website/tailwind.config.mjs`) — its
> `Brand`/`FontCatalogEntry` types are the canonical contract (§ Shared brand contract). Backend
> design origin: `backend/manttio-whitelabeled-backend-plan.md` §3. Root `CLAUDE.md` →
> "Whitelabel de-branding (fork rule)" governs.
> **Owner:** branch `feature/fullstack-whitelabel-branding` (worktree
> `../manttio-whitelabeled-worktrees/whitelabel-branding`, off `main`).

Two halves: **de-brand** (remove every hardcoded Peña Nevada literal from shipped code/config)
and **re-brand at runtime** (each app pulls its identity from the backend brand object, the way
`website/` already does). The website is the reference implementation and ~done; the **backend
brand source (01)** and the **field-app consumption (02)** are net-new and hold the bulk of the
work.

> **Guiding principle — Peña becomes *data*, not code (not deletion).** De-branding does not
> erase Peña Nevada; it **moves** it out of source and into the brand table as the *current
> tenant's row* (seeded from today's wrangler vars + logo assets uploaded to R2). Nothing
> renders Peña from a literal anymore, but the running Peña deployment looks identical because
> its brand row carries the same values. This is why the `wrangler.toml` `BRAND_*` are a
> **migration, not a blind delete** (per the CLAUDE.md rule).

---

## Suite map

| Plan | Scope | PR(s) | Phases |
|---|---|---|---|
| **`01-brand-backend`** | `modules/brand/` (`GET /brand` + `/fonts`, owner `PUT /brand`), de-hardcode email/PDF, migrate `BRAND_*` → brand row, seed the Peña row, website residuals | **PR-A** | CP-1…CP-4 |
| **`02-brand-frontend`** | field-app brand state + CSS-var theming + `app.ts` apply effect; dynamic PWA manifest route | **PR-B**, **PR-C** | CP-1…CP-2 |

**Sequencing:** 01 (PR-A) is independently valuable and unblocks the website immediately. 02 can
build in parallel (fail-soft against a missing `/brand`) but its "brand actually changes the app"
verification depends on 01 being live.

---

## Branding rules (canonical)

Settled invariants — they govern every plan in this suite; treat them as fixed, not per-PR choices.

1. **One shared brand contract.** Backend `GET /brand` + `GET /fonts` emit exactly the
   `Brand` / `FontCatalogEntry` types below; the website and field app both consume that shape.
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
   becomes the current tenant's brand row (01). The generic HVAC noun "chillers" is not brand.
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

## Current reality (re-verified against `main` `5321e57`, 2026-07-11)

Nothing of `01`/`02` has landed — the plan is fully pending. Already on `main`: website brand
*consumption* (#44), the CMS module (#54), report-templates (#50), status enums as TS enums (#57);
latest migration `0013`.

- **Backend:** no `brand` table, no `GET /brand`/`/fonts`, no DO. Brand is hardcoded `wrangler.toml`
  vars (`BRAND_*`, `RESEND_FROM`, domains) read only by the report-email module; the email
  **subject** is the literal `"…– Peña Nevada Chillers"` (helpers L68); email + PDF theme colors are
  hardcoded hex. DB is **single-tenant** (no `tenant_id`).
- **Website:** brand *consumption* is **done** (#44) — fetches `/brand` + `/fonts` + CMS SSR,
  fail-soft to neutral defaults. **Residual only:** still **hex / RGB / steps 50–950**, worker named
  `pena-nevada-website` → `01` migrates it to HSL/0–1000 + renames. Falls back today because
  `/brand` 404s (until `01`).
- **Field app (`frontend/`):** **zero** runtime brand machinery — compile-time hex palette, brand
  literals in `manifest.webmanifest` / `index.html` / a `_index.scss` comment / the login
  `assets/logo.jpg`. Palette byte-identical to the website's; `app.config.ts`
  (`provideAppInitializer`) + `app.ts` (`effect()` already mutating `<html>`/`theme-color`) are the
  boot-fetch + apply seams.

---

## Shared brand contract

The canonical `Brand` / `FontCatalogEntry` types **already exist** in `website/src/lib/types.ts`
(shipped #44) — that *is* the contract. Backend `GET /brand` must emit exactly that shape and the
field app mirrors it; **do not re-declare it here or fork a second shape.**

**One delta vs. the repo today** (rule 2): colors move to **HSL, steps 0–1000, no hex** — the
shipped `BrandColorScale` comment still says `'50'…'950' → hex`. So its values become `H S% L%`
components at steps `0`…`1000`, and CSS output everywhere is `hsl(var(--brand-<scale>-<step>) /
<alpha-value>)`. Logos stay finished CDN URLs, fonts stay catalog codes, absent fields hide (rule
5). `01` migrates the website + backend onto this delta.

---

## De-brand inventory (spans both plans)

Cross-references the CLAUDE.md rule's list. **Brand literals to remove/migrate** (NOT the generic
HVAC noun "chillers", which stays — e.g. `website/src/lib/defaults.ts` marketing copy):

| Plan | App | File | Literal | Resolution |
|---|---|---|---|---|
| 02 | frontend | `public/manifest.webmanifest` | name/short_name/description/theme_color | replaced by the dynamic manifest route (02) |
| 02 | frontend | `src/index.html` | `apple-mobile-web-app-title="Peña Nevada"` | runtime-set (02) |
| 02 | frontend | `src/theme/_index.scss` | comment | reword (02) |
| 02 | frontend | `src/assets/logo.jpg` | bundled brand logo | → `brand.logoUrl` (keep a neutral bundled fallback) (02) |
| 01 | backend | `reports/helpers/report-email.helpers.ts` | subject literal | `brand.name` (01) |
| 01 | backend | `reports/templates/report-email.html.ts` + `pdf/constants/pdf-layout.ts` | hardcoded colors/logo | brand at render (01) |
| 01 | backend | `wrangler.toml` | `BRAND_*` | **migrate to brand row** then drop; infra vars stay (01) |
| 01 | website | `wrangler.jsonc` | worker name | neutral (01) |

---

## Cross-cutting open decisions
- **Locked** in Branding rules above (shared contract · HSL/no-hex/0–1000 · backend-provided
  fallback · absent-hides · server-side materialization · `RESEND_FROM` · one-deploy-per-tenant)
  plus scope: full-stack across the suite · dynamic manifest route.
- **PR granularity (decided 2026-07-11):** two plan files, **three PRs** — 01 = PR-A; 02 = PR-B +
  PR-C. Checkpoints inside each file track the phases.
- Per-plan open items live in their own files: **font-catalog contents** + **tint L-stops** in
  `01-brand-backend`; **PWA icon assets** in `02-brand-frontend`.
