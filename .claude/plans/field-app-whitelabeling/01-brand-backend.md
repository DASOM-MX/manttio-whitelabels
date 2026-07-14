# Whitelabel 01 — Backend brand source (PR-A)

> **Status:** planned · **Last updated:** 2026-07-12 · **PR:** PR-A
> **Part of:** `.claude/plans/field-app-whitelabeling/` (see `00-master` for the canonical
> Branding rules, shared brand contract, current reality, and de-brand inventory).
> **Owner:** branch `feature/fullstack-whitelabel-branding`.

Build the backend brand source the whole suite depends on, de-hardcode the render paths, migrate
the current Peña values into data, and clear the website's residual literals. **Independently
valuable: this alone lights up the already-built website against a real `/brand` + `/fonts`.**

Governed by `00-master` → Branding rules. Enums are **TS enums** (`z.nativeEnum` + `.$type<>()`
— repo convention).

## 1. `modules/brand/` (net-new, module-first per `backend/CLAUDE.md`)

### 1.1 Table + migration (single row, direct-apply, no draft)
`brand` table (next migration after `0013`). The editor **sends fully materialized scales**
(mock/superadmin contract, §1.4), so the backend **stores them verbatim** — no server-side tinting.
Columns: `id` (single-row guard), `name`, `slogan?`, `description?`, `logo_key?`, `logo_dark_key?`,
`isologo_key?`, `favicon_key?` (PWA manifest, `02`), `colors` (jsonb —
`{ primary: HslScale, surface: HslScale }`, HSL components at steps `0…1000`, **no hex**, rule 2),
`contact` (jsonb), `social` (jsonb), `font` (jsonb `{ body?, heading? }`), timestamps.
**No `tenant_id`** (one deploy = one tenant).

### 1.2 Endpoints (mount `GET /brand` + `GET /fonts` BEFORE the JWT guards, like `/public/cms`)
- `GET /brand` — **public**, returns the stored `Brand` (§1.4): `colors` scales as stored (HSL
  `0…1000`); `*_key` → `cdnUrl(CDN_BASE_URL, key)` for `logoUrl`/`logoDarkUrl`/`isologoUrl`;
  contact/social/font as stored. Fail-soft is the client's job (both apps already default).
- `GET /fonts` — **public**, a curated OFL catalog (constants-only `FontCatalogEntry[]`, woff2
  URLs on the CDN/R2). Matches what the website + superadmin editor resolve against.
- `PUT /brand` — **JWT + owner** (`requireRole(['owner'])`), body `SaveBrandRequest` (§1.4): images
  as **R2 keys** (`logoKey`/`logoDarkKey`/`isologoKey`, from `POST /upload/image`), `colors` =
  materialized HSL `0…1000` scales, + `contact`/`social`/`font`. Upsert the single row,
  direct-apply (no publish). Response = the `Brand` read shape (keys materialized to CDN URLs).

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

### 1.4 Concrete contract — pinned 2026-07-12 (from the shipped superadmin + smoke mock)

Pinned from `superadmin/src/app/data/dtos/brand.ts` (mirrors `website/src/lib/types.ts`) and the
smoke mock the editor was built against. **Structure adopted as-is; color scales stay HSL `0…1000`,
no hex (rule 2).**

```ts
HslScale = { [step: string]: string }   // steps '0'…'1000' by 100 → "H S% L%" (no hex)

// GET /brand → Brand
Brand {
  name; slogan?; description?;
  logoUrl?; logoDarkUrl?; isologoUrl?;                       // materialized from *_key via cdnUrl
  colors?: { primary?: HslScale; surface?: HslScale };
  contact?: { phone?; whatsapp?; email?; address? };
  social?: { facebook?; instagram?; tiktok?; googleMaps?; [k]: string };
  font?: { body?; heading? };                               // catalog codes
}

// PUT /brand (owner) → SaveBrandRequest
SaveBrandRequest {
  name; slogan?; description?;
  logoKey?; logoDarkKey?; isologoKey?;                       // R2 keys from POST /upload/image
  colors: { primary: HslScale; surface: HslScale };          // required, materialized by the editor
  contact?; social?; font?;
}

// GET /fonts → FontCatalogEntry[]  (constants)
FontCatalogEntry {
  code; label; group?; roles?: 'body' | 'heading' | 'both';
  files: { variable? };                                     // woff2 URL
  fallbackStack?; tnumVerified?; recommendedHeading?;
}
```

**Reconciliation (2026-07-12):** the shipped superadmin editor + smoke mock currently emit **hex at
steps 50–950** (surface +0) and send materialized scales. We keep **HSL / 0…1000** (rule 2) — so the
**superadmin brand editor + its `brand.ts` `BrandColorScale` must be reworked** to emit HSL `0…1000`
(track in superadmin `03-branding`), and the **website** migrates too (§3). The backend is the
canonical shape; **images-as-keys** and **client-materialized-scales** are adopted from the mock
as-is (the backend stores scales verbatim, no server-side tinting).

## 2. Seeding the current tenant (Peña as data)
- One-time seed of the `brand` row from today's values: `name='Peña Nevada Chillers'`, `colors` =
  the current navy/granite palette materialized as **HSL `0…1000` scales** (no hex stored), contact
  from `PUBLIC_CONTACT_*`, and **upload the current logo assets to R2** (`penanevada-*` from
  `website/public/brand/` + `frontend/src/assets/logo.jpg`) → set `*_key`s.
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

## Checkpoints (implemented 2026-07-12, PR-A)
### CP-1 — Table + endpoints
- [x] `brand` table + migration `0014` (`colors` jsonb HSL `0…1000`; `*_key` image cols; singleton
      CHECK `id = 1`); `FontRole` TS enum
- [x] `GET /brand` (public, neutral default until the row exists) + `/fonts` (public) +
      `PUT /brand` per the §1.4 contract **+ `siteUrl?`** (decided 2026-07-12 — the email footer
      needs it; column `site_url`, optional, mirrored into the website types)
- [x] Store scales verbatim (no tinting); `*_key` → `cdnUrl` on read; validators reject hex /
      non-`0…1000` steps / unknown font codes

### CP-2 — De-hardcode render paths
- [x] Email subject + colors and PDF read brand at render (no `env.BRAND_*`); email palette is
      brand-derived **hex** (Outlook can't parse `hsl()`); PDF gets a `PdfTheme` + logo strip
- [x] `RESEND_FROM = no-reply@<domain>`, display name `brand.name`; `brand.contact.email` → `reply_to`
- [x] `wrangler.toml` `BRAND_*` dropped; dev `API_BASE_URL` gap fixed

### CP-3 — Provisioning + verify (reshaped 2026-07-12: **no seed**)
- [x] **No seed** — brand values arrive from the higher-level whitelabel manager:
      `PUT /brand` dual guard (owner JWT **or** `X-Manager-Token` vs the `MANAGER_SHARED_TOKEN`
      secret, constant-time, fail-closed; `auth/middleware/manager.middleware.ts`), and
      `POST /upload/image` admits the manager token so pushes can carry logos
- [x] Email + PDF fail-soft pre-provisioning (neutral palette, identity hides)
- [x] Grep clean of **backend** literals (fixture emails + infra domains in `wrangler.toml` stay)

### CP-4 — Website residuals + light-up
- [x] Worker name `manttio-website`; color model HSL / 0…1000 (`-50/-950` → `-0/-1000`)
- [x] Peña fallbacks stripped → neutral grayscale; `getSiteData` drops blank brand fields before
      merging (backend default `name: ''` must not clobber the fallback copy)
- [x] Verified against the real `/brand` + `/fonts` (local wrangler dev + astro dev: injected
      `:root` vars + fallback title); production light-up = deploy backend → run migration →
      manager push

## Open decisions (this plan)
- **Font catalog contents (resolved 2026-07-12):** the superadmin plan 03 §2.1 **launch set of 10**
  (Work Sans, Rubik, Inter, Public Sans, Archivo, Figtree, DM Sans, Plus Jakarta Sans, Sora,
  Source Serif 4) ships as `brand/constants/font-catalog.ts`. Hosted woff2s pending: entries emit
  `files.variable` only once `FONT_CDN_BASE_URL` (shared `branding-fonts` bucket CDN) is configured;
  until then consumers run on the two bundled defaults.
- **Color materialization (resolved 2026-07-12):** the **editor** materializes the HSL `0…1000`
  scales and sends them in `PUT /brand` (mock/superadmin contract, §1.4); the backend **stores them
  verbatim — no server-side tinting**. The tint/ramp algorithm lives in the superadmin editor (its
  rework to HSL `0…1000`), not the backend.
- **Deploy checklist (PR-A):** migration `0014` is applied to Neon (2026-07-12); set the
  `MANAGER_SHARED_TOKEN` secret (dev + production); verify `no-reply@` is deliverable under the
  Resend domain; provision the Peña brand row via the manager push (name, navy/granite scales as
  HSL `0…1000`, logo keys from **`POST /upload/logo`** — moved off `/upload/image` when the
  `manttio-logos` bucket landed in PR-C — using `../manttio/website/public/brand/
  penanevada-*`), then confirm email/PDF/website render Peña unchanged. See plan 02 for the
  PR-C additions (logos bucket + `LOGOS_CDN_BASE_URL` + Pages `API_BASE_URL`).
