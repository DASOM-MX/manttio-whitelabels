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
  social?: { facebook?, instagram?, ... }
}
```

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
| PDFs / emails (backend) | pdf/email modules read the brand object at render time (name, isologo, primary) — this is the planned whitelabel-PDF customization hook |
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
  public by nature)
- `PUT /brand` — **owner-only**. Own module — **not** under `/cms`.
- `POST /upload` → R2 key (existing upload module) for logo/isologo (SVG/PNG, size caps
  server-side)

## 6. Pages & components

- `branding/pages/brand-editor/` — top-level **Marca** nav entry (always visible; no
  config flag). Owner-only editing (admin gets the same page read-only): identity fields
  (name, slogan, contact, social), logo + isologo uploads previewed on light *and* dark
  chips, the two color pickers with derived-scale strips + advanced per-step override
  (§3), contrast warning. Saving goes through a **confirm-heavy apply dialog** (shape-3)
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
