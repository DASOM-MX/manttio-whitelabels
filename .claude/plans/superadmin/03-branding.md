# 03 — Branding (tenant identity)

> **Status:** not-started · **Depends on:** 02 (CP-3)
> **Priority:** **first after 02, alongside 04** — branding is the whitelabel selling
> point (prioritized 2026-07-05)
> **Owner:** — · **Last updated:** 2026-07-05

The logged-in client owns their **brand identity** — the name, logos, and colors that
skin the public website, the field app, superadmin itself, and backend-rendered
PDFs/emails. **Branding and the CMS are separate, independent entities (decided
2026-07-05):** brand is core platform identity with its own module and endpoints; the
CMS (04) is a headless content store. Neither depends on the other.

---

## 1. Permissions

- **Owner-only** editable (decided 2026-07-05 — supersedes the earlier read-only
  default); admin sees the same page read-only. High-stakes and rarely edited — same
  owner-customization precedent as contract types (13 §2).
- **Core, not config-gated:** brand has no `cms`-flag dependency — it themes the apps
  and PDFs even for a tenant with no website.
- **Never in tenant hands:** domain, `api_base_url`, legal/billing identity
  (manager-side, `billing_reference` guardrail), and the **PWA manifest + installed app
  icons** (provisioning-time — §4).
- **Manager seed/override (decided 2026-07-05):** we can also push a tenant's brand
  from the whitelabel manager (provisioning setup + occasional corrections) — it writes
  the same single row this editor writes; last write wins, no conflict mechanics. CMS
  content, by contrast, is never pushed from the manager (04).

## 2. Brand object (data model)

One brand object per tenant — the single source of truth for every branded surface:

```
Brand {
  name,                            // public brand name (never "manttio")
  slogan?,
  logoKey,                         // full logo/wordmark — R2 key
  logoDarkKey?,                    // dark-mode variant; falls back to logoKey
  isologoKey,                      // square mark — favicon/PWA-icon source, PDF header
  colors: {
    primary: { 50: …, 950: … },    // full materialized scales — consumers never
    surface: { 0: …, 950: … }      // run palette math
  },
  contact: { phone?, whatsapp?, email?, address? },
  social?: { facebook?, instagram?, ... },
  font?: {
    body: string,                  // catalog code — default 'work_sans'
    heading?: string               // catalog code — falls back to body; default 'rubik'
  }
}
```

### 2.1 Typography — curated variable-font catalog (decided 2026-07-05)

Tenant-facing typography is part of the brand. **Source: a curated OFL-only catalog**
we subset and host in R2 — never the Google Fonts CDN (offline field app + GDPR) and
no tenant uploads (licensing).

**Catalog contents — decided 2026-07-05, launch set of 10** (grouping = picker UI
sections; all OFL, variable, full Spanish latin coverage):

| Group | Code | Family | Notes |
|---|---|---|---|
| Defaults | `work_sans` | Work Sans | default **body** (website parity) |
| Defaults | `rubik` | Rubik | default **heading** (website parity) |
| Neutral / institutional | `inter` | Inter | UI standard; ships `tnum`; upstream field-app face |
| Neutral / institutional | `public_sans` | Public Sans | USWDS-born, deliberately unflashy |
| Neutral / institutional | `archivo` | Archivo | industrial grotesque (+ width axis); best HVAC fit |
| Contemporary / warm | `figtree` | Figtree | warm geometric |
| Contemporary / warm | `dm_sans` | DM Sans | low-contrast geometric, clean at UI sizes |
| Contemporary / warm | `plus_jakarta` | Plus Jakarta Sans | humanist-geometric hybrid |
| Character / heading | `sora` | Sora | techy, precise — heading over a neutral body |
| Character / heading | `source_serif` | Source Serif 4 | the one serif; flagged **heading-recommended** |

**Commissioner is deliberately excluded** — it's the superadmin's own voice; tenants
don't brand with it. The catalog is **append-only**: adding a family later is a
constants change + bucket upload (no migration, no app redeploy). Total bucket
payload ≈ 2–3 MB (per family: ~30–60 KB variable latin woff2 + ~100–200 KB static
TTF trio).

Catalog rules:

- **Variable fonts only** — one woff2 per family (latin + latin-ext subsets, full
  weight axis, expressive axes at defaults), so every Tailwind weight utility works
  from a single file.
- Each entry also ships **static TTF instances (400/600/700, cut at catalog build
  time)** for **PDF embedding** — PDFs *do* get the tenant font in v1 (fontkit can't
  embed variable fonts reliably). Emails stay on safe system stacks (clients strip
  web fonts).
- **Fixed set in v1 (decided 2026-07-05):** font binaries live in a dedicated shared
  R2 bucket, **`branding-fonts`** (CDN-fronted, one copy for all tenants); the catalog
  itself is a backend constants list — **no DB rows, nothing font-related in Neon**.
  Per-entry metadata: `code`, label, **picker group** (table above), `roles:
  body|heading|both`, files, fallback stack, tnum-verified flag, recommended heading
  pairing. Served by `GET /fonts` (public) so adding a family is a backend deploy,
  no app redeploy.
- **Tenant font uploads — deferred to a later phase (decided 2026-07-05).** Design
  sketched for when it's picked up: per-tenant `font_defs` definition entity (seeded
  rows locked, custom rows deactivate-only), uploads to the *tenant's own* R2 under
  `branding/fonts/` with a license-attestation checkbox (bring-your-own-license,
  Canva/Figma model), WOFF2/TTF/OTF accepted (1 variable file or N static files with
  declared weights), light sfnt validation on Workers (no server-side subsetting/
  instancing), PDF embeds customs only when a static TTF/OTF exists. Deferred to keep
  v1 lean (incl. the Neon default storage tier) — revisit on a real tenant ask.
- **Delivery = same pipeline as colors:** the boot `GET /brand` fetch drives injected
  `@font-face` rules (`font-display: swap`) pointing at the CDN files + CSS vars the
  Tailwind stacks read (`--font-body`, `--font-heading`); the field app's service
  worker runtime-caches the font URLs for offline.
- **Superadmin itself always renders Commissioner** (product chrome — 01 Typography);
  tenant fonts appear inside this module only in the editor's previews.

## 3. Color model — pick two, derive the scales

The editor asks for a **primary** hex and a **surface** (neutral tint) hex; from each it
derives the full scale (PrimeNG's `palette('#hex')` utility for primary; the same math,
neutral-leaning, for surface) with a live preview strip. An **advanced expander exposes
every derived step for individual override** — the easy path is two pickers, but the whole
0–1000 range stays reachable per step. Saving persists the **materialized scales**, so
consumers read ready-made ramps. A contrast check (primary-600 on white, primary-300 on
surface-950) warns but doesn't block.

## 4. Consumers + delivery

| Surface | Mechanism |
|---|---|
| Website | public brand read (independent of CMS content reads) |
| Field app + superadmin | boot fetch of `GET /brand` (public — the **login screen** needs logo + colors pre-auth) → PrimeNG `updatePreset`/`updatePrimaryPalette` at runtime + CSS variables backing the Tailwind palette tokens |
| PDFs / emails (backend) | pdf module reads the brand at render time (name, isologo, primary, **font via static TTF instances** — §2.1); emails get name/logo/colors but keep system font stacks |
| PWA manifest + app icons | **not runtime** — baked at provisioning by us; brand edits don't touch them in v1 |

Outside this module:

- **Both apps:** repoint the Tailwind palette scales in `tailwind.config.js` to CSS
  variables set at boot from the brand fetch, with the current manttio values as
  fallbacks — the enabler for runtime theming. Recorded in
  `backend/manttio-whitelabeled-backend-plan.md` §3 alongside the endpoints.
- **Provisioning:** manifest + icon set generated from the isologo when we stand the
  tenant up (manager-side runbook, not superadmin).

## 5. Expected API surface

- `GET /brand` — **public/unauthenticated** (login screens + website; every field is
  public by nature) — **served from the per-tenant cache DO, not Neon (§5.1)**
- `GET /fonts` — **public** curated catalog (codes, labels, file URLs, pairings — §2.1)
- `PUT /brand` — **owner-only**. Own module — **not** under `/cms`.
- `POST /upload` → R2 key (existing upload module) for logo/isologo (SVG/PNG, size caps
  server-side)

### 5.1 Read-path caching — per-tenant Durable Object (decided 2026-07-06)

`GET /brand` is the hottest tenant read (every website visit + every app boot,
pre-auth) against a row that almost never changes — it is served from the **per-tenant
cache Durable Object**, not straight from Neon:

- One SQLite-backed `TenantCacheDO` instance per tenant (shared with the CRM cache,
  08 §4.1) holds the materialized brand object; on a miss the DO loads it from Neon
  itself, so concurrent cold reads collapse into one query.
- **Write-through invalidation:** `PUT /brand` *and* the manager seed/override push
  (§1) commit to Neon first, then re-prime the DO entry in the same request — a stale
  login screen is exactly the failure this design buys off. Direct-apply (§8) is
  unaffected: the refreshed entry goes live immediately.
- Bindings, migration, alarm TTL safety net, and the cache-aside pattern are backend
  work — `backend/manttio-whitelabeled-backend-plan.md` §5. Nothing changes for this
  module's UI; Neon remains the source of truth.

## 6. Pages & components

- `branding/pages/brand-editor/` — top-level **Marca** nav entry (always visible; no
  config flag). Owner-only editing (admin gets the same page read-only): identity fields
  (name, slogan, contact, social), logo + isologo uploads previewed on light *and* dark
  chips, the two color pickers with derived-scale strips + advanced per-step override
  (§3), contrast warning, and **font pickers (body + heading)** from the catalog with
  live sample previews (catalog fonts loaded on demand, only in this editor). Saving
  goes through a **confirm-heavy apply dialog** (shape-3)
  restating that the website and both apps restyle — brand mistakes are loud, make the
  commit deliberate.

## 7. State

- `BrandState` (own state — deliberately not part of `CmsState`): `brand`, `loading`.
  Actions: `LoadBrand`, `SaveBrand`. `src/http/brand.service.ts`.
- Superadmin applies its own theming from `LoadBrand` at boot (shell task shared with
  02); the editor's live preview reuses the same apply helper against draft values.

## 8. Save model (decided 2026-07-05)

**Direct-apply — no draft state.** One row, `PUT /brand` goes live immediately for the
website and both apps; the apply dialog (§6) is the gate, and the in-editor previews
cover "see it before committing" without dual-state plumbing. (Contrast with the CMS,
which *is* draft→publish — `04-cms.md` §5.)

---

## Checkpoints

### CP-1 — Read path + boot theming
- [ ] Brand DTO + `brand.service` + `BrandState`; `GET /brand` renders a read-only
      brand card
- [ ] **Marca** route + nav entry (visible regardless of `cms` flag); route `data`
      declared
- [ ] Boot apply helper: CSS variables + PrimeNG preset update from the fetched brand
      (manttio fallbacks when unset) — login screen shows tenant logo + colors

### CP-2 — Editor
- [ ] Identity fields + logo/isologo uploads (light/dark preview chips)
- [ ] Two color pickers → derived scale strips + advanced per-step override + contrast
      warning
- [ ] Font pickers (body + heading) from `GET /fonts` with on-demand sample previews
- [ ] Confirm-heavy apply dialog; owner-only write, admin read-only

### CP-3 — Polish
- [ ] Superadmin re-themes from a fresh save without reload (apply helper)
- [ ] Dark-mode audit; build green; manual pass: change primary → apply → superadmin +
      login screen restyle immediately; logo swap shows on login

## Open decisions / asks
- Ask (both apps): Tailwind palette → CSS variables repoint with manttio fallbacks (§4)
  — the field-app change is upstream-style work in this fork's `frontend/`.
- Per-step scale override: keep the advanced expander lean; if it complicates the form
  meaningfully, ship two-picker-only first and add overrides in a fast follow.
- Favicon/PWA icon regeneration from a changed isologo — provisioning-time v1; revisit
  only if tenants actually churn logos.
- ~~Typography in the Brand object — v2~~ — **promoted to v1, decided 2026-07-05**
  (§2.1): curated OFL variable-font catalog, `font { body, heading? }`, Work Sans +
  Rubik as defaults, PDFs via static instances. Superadmin stays Commissioner.
- ~~Initial catalog contents~~ — **resolved 2026-07-05: launch set of 10** (§2.1
  table — Work Sans, Rubik, Inter, Public Sans, Archivo, Figtree, DM Sans, Plus
  Jakarta Sans, Sora, Source Serif 4). At catalog build time every entry still needs
  the latin subset + 400/600/700 static instances + tnum verification, uploaded to
  the `branding-fonts` bucket.
- ~~Tenant-uploaded fonts not offered~~ — **deferred to a later phase** with the
  design recorded in §2.1 (per-tenant `font_defs`, own-bucket uploads, license
  attestation). Not in v1.
