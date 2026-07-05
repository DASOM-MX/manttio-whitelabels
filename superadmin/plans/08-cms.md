# 08 — CMS + Branding (webpage content + tenant identity)

> **Status:** not-started · **Depends on:** 02 (CP-3)
> **Owner:** — · **Last updated:** 2026-07-05

The logged-in client edits their own marketing-site content (`cms_home`, `cms_clients`)
**and their brand identity** — the name, logos, and colors that skin the public website,
the field app, superadmin itself, and backend-rendered PDFs/emails. This absorbs the
original superadmin plan (`../manttio-whitelabeled-superadmin-plan.md`, now superseded) —
scope and guardrails carried over.

---

## 1. Permissions

- **CMS content (decided 2026-07-05):** `owner` + `admin` edit `cms_home`, `cms_clients`;
  office and technician have no CMS access (`10-access-control.md` §2). Content editing is
  behind the tenant `cms` config flag.
- **Brand identity (decided 2026-07-05 — supersedes the earlier read-only default):**
  tenant-owned and **owner-only** editable; admin sees a read-only brand card. High-stakes
  and rarely edited — same precedent as contract-type management (13 §2). Brand is
  **core, not gated by the `cms` flag** — it themes the apps and PDFs even for a tenant
  with no website.
- **Never in tenant hands:** domain, `api_base_url`, legal/billing identity (manager-side,
  `billing_reference` guardrail), and the **PWA manifest + installed app icons**
  (provisioning-time — see §2.3).

## 2. Brand identity (decided 2026-07-05)

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

### 2.1 Color model — pick two, derive the scales

The editor asks for a **primary** hex and a **surface** (neutral tint) hex; from each it
derives the full scale (PrimeNG's `palette('#hex')` utility for primary; the same math,
neutral-leaning, for surface) with a live preview strip. An **advanced expander exposes
every derived step for individual override** — the easy path is two pickers, but the whole
0–1000 range stays reachable per step. Saving persists the **materialized scales**, so
consumers read ready-made ramps. A contrast check (primary-600 on white, primary-300 on
surface-950) warns but doesn't block.

### 2.2 Consumers + delivery

| Surface | Mechanism |
|---|---|
| Website | public brand read — same channel as CMS content |
| Field app + superadmin | boot fetch of `GET /brand` (public — the **login screen** needs logo + colors pre-auth) → PrimeNG `updatePreset`/`updatePrimaryPalette` at runtime + CSS variables backing the Tailwind palette tokens |
| PDFs / emails (backend) | pdf/email modules read the brand object at render time (name, isologo, primary) — this is the planned whitelabel-PDF customization hook |
| PWA manifest + app icons | **not runtime** — baked at provisioning by us; brand edits don't touch them in v1 |

### 2.3 What this requires outside this module

- **Both apps:** repoint the Tailwind palette scales in `tailwind.config.js` to CSS
  variables set at boot from the brand fetch, with the current manttio values as
  fallbacks. Small, but it's the enabler for runtime theming — recorded in
  `backend/manttio-whitelabeled-backend-plan.md` §3 alongside the endpoints.
- **Provisioning:** manifest + icon set generated from the isologo when we stand the
  tenant up (manager-side runbook, not superadmin).

## 3. Expected API surface

- `GET /cms/home` · `PUT /cms/home`
- `GET /cms/clients` · `POST /cms/clients` · `PATCH /cms/clients/:id` ·
  `DELETE /cms/clients/:id`
- `GET /brand` — **public/unauthenticated** (login screens + website; every field is
  public by nature). `PUT /cms/brand` — **owner-only**.
- `POST /upload` → R2 key (existing upload module) for CMS images and brand logos
  (SVG/PNG, size caps server-side)
- If draft→publish (see §6): `POST /cms/:section/publish` + draft/published variants on GET

## 4. Pages & components

- `cms/components/repeater/` — the reusable **`RepeaterComponent<T>`**: FormArray-backed
  add / remove / **reorder** (anime.js for the reorder animation, per conventions) used by
  every jsonb array group. Build first; everything else composes it.
- `cms/pages/home-editor/` — scalar fields (titles, descriptions, service_area) +
  repeater groups: badges, service targets, services, services_content. One save action
  for the whole document.
- `cms/pages/clients-editor/` — `<p-table>` of client logos/entries + **drawer form**
  per entry; image upload → R2 key via backend; `business_relation_description` through a
  **constrained rich-text control** (no arbitrary markup paste-through — backend sanitizes
  on write, the editor still restricts input).
- `cms/pages/brand-editor/` — **replaces the old read-only brand-view.** Owner-only
  (admin gets the same page read-only): identity fields (name, slogan, contact, social),
  logo + isologo uploads previewed on light *and* dark chips, the two color pickers with
  derived-scale strips + advanced per-step override (§2.1), contrast warning. Saving goes
  through a **confirm-heavy apply dialog** (shape-3) restating that the website and both
  apps restyle — brand mistakes are loud, make the commit deliberate.
- **Publish control** *(only if draft→publish, §6)*: "Publish" action + an "unpublished
  changes" badge (draft vs last-published compare) on all editors.

## 5. State

- `CmsState`: `home`, `clients`, `brand`, `loading`, `dirty`/`unpublished` flags. Actions:
  `LoadCmsHome`, `SaveCmsHome`, `LoadCmsClients`, `CreateCmsClient`, `UpdateCmsClient`,
  `DeleteCmsClient`, `LoadBrand`, `SaveBrand` (+ `PublishCms(section)` if publish-step).
- `src/http/cms.service.ts`.
- Superadmin applies its own theming from `LoadBrand` at boot (shell task shared with 02;
  the brand-editor's live preview reuses the same apply helper against draft values).

## 6. Open decision (carried over — shapes this UI)

> **draft→publish vs edit=live.** If publish-step: editors save drafts and a Publish
> button pushes live. If edit=live: saves go live, no draft state, no Publish button.
> Decided on the backend (write paths); this UI mirrors the choice. **Blocker for CP-2 —
> resolve before building save flows.** Brand rides the same decision — note that
> edit=live makes a brand save restyle both apps immediately, which is why the apply
> dialog (§4) is confirm-heavy either way.

**Guardrail:** the HTML field is sanitized on the backend on write; still use a
constrained editor here.

---

## Checkpoints

### CP-1 — Repeater + read path
- [ ] `RepeaterComponent<T>` (add/remove/reorder, typed row templates)
- [ ] `CmsState` + service; home + clients + brand load and render read-only
- [ ] Route + sidebar entries live (Marca visible even with `cms` flag off)

### CP-2 — Editors *(blocked on §6 decision)*
- [ ] Home editor: scalars + all four repeater groups, single save
- [ ] Clients editor: table + drawer, image upload → R2 key, constrained rich-text
- [ ] Brand editor: identity fields + logo/isologo uploads (light/dark preview chips) +
      two pickers → derived scales + per-step override + contrast warning + apply dialog;
      owner-only write, admin read-only

### CP-3 — Publish + polish
- [ ] Publish control + unpublished-changes badge *(if publish-step)*
- [ ] Dirty-navigation guard (confirm on leaving with unsaved changes)
- [ ] Superadmin re-themes from a fresh brand save without reload (apply helper)
- [ ] Dark-mode audit; build green; manual pass: edit home → save → edit client entry
      with image → verify on the rendered site → change primary color → superadmin +
      login screen restyle

## Open decisions / asks
- §6 draft→publish vs edit=live — backend decision, blocks CP-2.
- Rich-text control choice: PrimeNG Editor (Quill) constrained toolbar vs minimal custom
  contenteditable — decide at CP-2 start.
- ~~Brand editability policy~~ — **decided 2026-07-05: tenant-owned, owner-only** (§1).
- Ask (both apps): Tailwind palette → CSS variables repoint with manttio fallbacks
  (§2.3) — field app change is upstream-style work in this fork's `frontend/`.
- Per-step scale override: keep the advanced expander lean; if it complicates the form
  meaningfully, ship two-picker-only first and add overrides in a fast follow.
- Favicon/PWA icon regeneration from a changed isologo — provisioning-time v1; revisit
  only if tenants actually churn logos.
