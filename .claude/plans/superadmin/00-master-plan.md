# 00 — Superadmin master plan

**App:** `superadmin/` — the whitelabeled in-product admin. A logged-in **client** (tenant
owner/staff) manages their own instance: brand identity, CMS content, users, reports,
billing, clients + CRM, and a small warehouse system. Tenant-scoped, product-user-authed — **never** the shared token.

System map: **[this] superadmin** → whitelabeled backend (tenant-scoped API, user-auth).

---

## 1. Plan files (one agent per module)

Each numbered file below is the **single source of truth for exactly one module**, and is
owned by **one agent** at a time. An agent working a module reads `01-conventions.md` first,
then its own file, and touches no other module's code.

| # | File | Module | Depends on |
|---|---|---|---|
| 00 | `00-master-plan.md` | This file — protocol + progress board | — |
| 01 | `01-conventions.md` | Styling + component writing rules (ported from `frontend/CLAUDE.md`) | — |
| 02 | `02-app-shell.md` | App shell: platform decisions, auth gate, layout, nav, theming, dashboard stub | 01 |
| 03 | `03-branding.md` | Brand identity: name/logos/colors → themes site, both apps, PDFs/emails | 02 |
| 04 | `04-cms.md` | Headless CMS: home + clients content documents (draft→publish) | 02 |
| 05 | `05-users.md` | Users management | 02 |
| 06 | `06-reports.md` | Reports browser + custom report-template builder | 02 |
| 07 | `07-clients.md` | Clients directory + Mexican invoicing info | 02 |
| 08 | `08-crm.md` | Light CRM: status, source, blacklist, activity timeline, follow-up date | 07 |
| 09 | `09-billing.md` | Billing + billing-by-reports | 02, 06, 07 |
| 10 | `10-wms.md` | Warehouse management: locations, materials, replenishments (file import + evidence), technician stock, report material tracking | 02, 05, 06 |
| 11 | `11-equipment.md` | Client equipment/asset registry + per-unit service history | 07; hooks 06, 10 |
| 12 | `12-calendar.md` | Scheduled visits + team calendar (reassign, tech swap, Google Calendar push + overlay) | 02, 05, 07 |
| 13 | `13-contracts.md` | Maintenance contracts (pólizas) → generate visits into 12 | 07, 12; 11 opt. |
| 14 | `14-access-control.md` | Roles + tenant-config gating matrix (reference, binding for all modules) | — |
| 15 | `15-website.md` | Public tenant website: consumes published CMS + brand (reads only — `website/` package work, not superadmin code) | 03, 04 |

Build order **is numeric order** (renumbered 2026-07-05: branding and CMS are separate,
independent modules — 03/04 — and access-control moved to 14 as pure reference).
**01 → 02** are prerequisites for everything. After 02 lands, **03 + 04 go first —
branding + headless CMS are the whitelabel selling points** (independent of each other;
parallel agents). **05, 06, 07** run in parallel as capacity allows. **08** starts after
07's data-model checkpoint; **09** after 06 + 07; **10** after 05 + 06. Second wave:
**11** after 07; **12** after 05 + 07; **13** after 12's CP-1 (visit entity) —
contracts generate visits, so the calendar's entity must exist first. **15** (the
public website) is consumer-side `website/` work — it can start once 03's brand read
path and 04's publish flow exist backend-side; it never blocks a superadmin module.

---

## 2. Checkpoint protocol

Every module file ends with **checkpoints** (`CP-1`, `CP-2`, …). A checkpoint is a gate: all
its checklist items must be done and the app must build (`npm run build`) before the agent
moves past it.

Checklist item states: `- [ ]` todo · `- [~]` in progress · `- [x]` done.

Each module file carries a status header the owning agent keeps current:

```
> **Status:** not-started | in-progress (CP-n) | blocked (reason) | done
> **Owner:** <agent/session note> · **Last updated:** YYYY-MM-DD
```

Rules for agents:

1. Update your module file's checkboxes + status header **in the same commit** as the code.
2. Commit prefix: `feat(superadmin)`, `fix(superadmin)`, `docs(superadmin)`; small commits
   per checkpoint, PR base `main`.
3. If you need something from another module (an API shape, a shared component), **do not
   build it** — record it under "Open decisions / asks" in your file and mark yourself
   blocked if it's a hard dependency.
4. Shared widgets go to `src/app/shared/components/` only when a second module needs them;
   until then keep them in your feature folder.
5. Backend endpoints listed in module files are the **expected** API surface — the backend
   is planned separately. Build against typed HTTP services + DTOs so mocks can back them
   until the endpoints exist. Backend-side obligations from these plans are consolidated
   in **`backend/manttio-whitelabeled-backend-plan.md`** — when a decision here creates
   backend work, record it there too (keep both in the same commit).

---

## 3. Progress board

| Module | Status | Checkpoint |
|---|---|---|
| 01 conventions | done (doc) | — |
| 02 app-shell | **done** (PR: `feature/superadmin-app-shell`) | CP-3 |
| 03 branding | **done** (frontend side; branch `feature/superadmin-branding`) | CP-3 |
| 04 cms | **done** (frontend side; branch `feature/superadmin-cms`) | CP-3 |
| 05 users | **done** (frontend side; branch `feature/superadmin-users`) | CP-3 |
| 06 reports | **done** (frontend side; branch `feature/superadmin-reports`) | CP-5 |
| 07 clients | **done** (frontend side; branch `feature/superadmin-customers`) | CP-3 |
| 08 crm | not-started | — |
| 09 billing | not-started | — |
| 10 wms | not-started | — |
| 11 equipment | not-started | — |
| 12 calendar | not-started | — |
| 13 contracts | not-started | — |
| 14 access-control | done (doc) | — |
| 15 website | in-progress · PR #44 | CP-2 |

*(Owning agents update their row when they update their file's status header.)*

---

## 4. Cross-module decisions (resolved here, not per-module)

- **Stack parity with `frontend/`:** Tailwind 3.4, PrimeNG Aura + manttio preset, NGXS
  (**decided 2026-07-05** — `@ngxs/*@^21` on Angular 21, compat verified), standalone +
  signals, zoneless. Details + porting tasks in `01-conventions.md` and `02-app-shell.md`.
- **Rendering: CSR now, SSR later — decided 2026-07-05.** Feature blocking by tenant
  config + user role ships client-side (boot-time `/auth/me`, centralized `access.ts`);
  the SSR move happens when client volume justifies it and is confined to the shell —
  upgrade path in `14-access-control.md` §5.
- **Roles — decided 2026-07-05:** baseline four (`owner`, `admin`, `office`,
  `technician`), full access matrix in `14-access-control.md` §2. Every module declares
  route `data: { module, roles }` and hides forbidden actions via the shared `hasRole`
  helper.
- **Soft deletes everywhere** user-facing (matches backend convention). Delete dialogs follow
  the `delete-user-dialog` canonical shape (audit comment + typed confirmation).
- **Audit records are append-only — decided 2026-07-05.** No audit trail (WMS movements
  today; any future one) is ever edited or deleted. Corrections are new compensating
  entries — in WMS, the `readjustment` movement type (`direction: in|out`, reason
  required, owner/admin only). See `10-wms.md` §1 and `14-access-control.md` §2.1d.
- **CRM scope — decided 2026-07-05** (target: small/medium service companies,
  independent providers): **no Deal/opportunity entity in v1** — lead stays a client
  status; **full append-only activity timeline** (`Interaction` entity, manual notes +
  system events, subsumes status history); follow-ups are a single `nextFollowUpAt`
  field, not a task system. v2 growth path (deals with fixed stages, task entity)
  recorded in `08-crm.md` open decisions.
- **CRM expansion — decided 2026-07-05:** the cheap high-value set ships with 07/08
  (client 360 header, multiple contacts, tags, referral link, WhatsApp/call/email
  quick actions that pre-fill the timeline composer). The strategic set gets its own
  modules: **11 equipment registry**, **12 calendar/scheduled visits** (staff schedule +
  reassign; technicians view team calendar and swap their own visits), **13 maintenance
  contracts** (office drafts, owner/admin activate; activation generates visits into 12).
  Service **sites** (multi-location clients) deliberately held until a real tenant asks.
- **Visit reassignments are audited append-only** (same principle as WMS movements):
  assignment history is never edited/deleted; `technicianId` is the latest entry. See
  `12-calendar.md` §1.
- **Tenant-customizable definition entities (pattern — decided 2026-07-05):** when a
  "type/reason/category" list must be extensible by the tenant, it is **data, not an
  enum**: a `*Def` entity with an immutable auto-slugged `code`, an editable `label`,
  and an `active` flag — **deactivate-only, never deleted** (referencing records keep
  rendering by `code`). Instances: WMS `MovementReasonDef` (10 §1, owner/admin, locked
  built-ins) and `ContractTypeDef` (13 §1.1, owner-only, unlocked seeds). New extensible
  lists must reuse this shape.
- **Brand identity is tenant-owned — decided 2026-07-05** (supersedes "brand read-only,
  set via manager push"): one `Brand` object per tenant (name, slogan, logo/logo-dark/
  isologo R2 keys, contact, social, **materialized** primary + surface color scales
  derived from two hex pickers with per-step override), edited **owner-only** in 03.
  Consumed by the website, **both apps** (boot fetch of public `GET /brand` → runtime
  PrimeNG preset update + CSS-variable-backed Tailwind palette), and backend
  **PDFs/emails** at render time. Brand is **core** — not gated by the `cms` flag.
  Stays out of tenant hands: domain, legal/billing identity, PWA manifest + app icons
  (provisioning-time). Detail: `03-branding.md`; backend obligations in
  `backend/manttio-whitelabeled-backend-plan.md` §3.
- **Branding ≠ CMS — decided 2026-07-05:** two separate, independent modules (03/04)
  with their own endpoints, states, and nav entries; neither depends on the other. The
  CMS itself is **headless**: the backend serves content documents API-first and the
  tenant's public website is just one consumer — no site-specific coupling anywhere in
  04. **Only branding has a manager push path** (provisioning seed + corrections, same
  row as the owner editor, last write wins); **CMS content never travels through the
  manager**.
- **Typography — decided 2026-07-05:** the superadmin's typeface is **Commissioner**
  (variable, self-hosted) — our product's own voice, constant across tenants, a
  deliberate deviation from frontend parity (details: 01 Typography). Tenant-facing
  surfaces are **brand-font-driven**: `Brand.font { body, heading? }` picked from a
  **curated OFL variable-font catalog** — a fixed set in the shared `branding-fonts`
  R2 bucket, catalog as backend constants, nothing in Neon (one variable woff2 +
  static TTF instances per family; no Google CDN; tenant uploads deferred to a later
  phase, design in 03 §2.1) — **launch set of 10 decided 2026-07-05** (table in 03
  §2.1; Commissioner deliberately excluded), defaults **Work Sans + Rubik**. The website already uses the defaults; the **field app
  migrates Inter → brand-font CSS vars** with those defaults (fork `frontend/` task,
  outside superadmin plans; keep `font-data`/Atkinson for numeric columns). **PDFs
  embed the tenant font via static instances in v1; emails keep system stacks.**
  Detail: `03-branding.md` §2.1.
- **Design language — decided 2026-07-05: "solid & tight."** Dense operations-console
  aesthetic (dark-fintech reference): low-to-mid whitespace, hairline borders over
  shadows, strong status cues (pills, accent bars, uppercase micro-labels, tabular
  numerals, skeletons), fluid motion via Angular `animate.enter`/`animate.leave` + `animations.scss`
  tokens (**revised 2026-07-06** — anime.js dropped), **no emojis ever,
  outlined icons only (`@lucide/angular`)**, compact `h-12` control baseline — plus
  binding **Accessibility (CRITICAL)**, **Layout & responsive (HIGH)**, **Animation
  (MEDIUM)**, and **Forms & feedback (MEDIUM)** rule sets (WCAG contrast, focus
  rings, aria-labels, keyboard nav, reduced motion; Tailwind breakpoints, 16px mobile
  inputs, dvh units, z-index scale; transform-only animation, exit-faster-than-enter,
  interruptibility; inline validation on blur, error recovery, undo/confirm
  semantics). Full spec in
  `01-conventions.md`; mirrored in the **committed skill
  `.claude/skills/superadmin-design`** so every module agent auto-loads it (keep both
  in sync in the same commit).
- **Custom report templates — decided 2026-07-05:** tenants design their own field-app
  report forms (06 §5, **owner/admin only**, own route `/templates` + top-level
  **Plantillas** nav entry). Fixed skeleton on every template: report heading + report
  content + **comments (always present)** + **signature — a selling point: every
  report requires a captured signature to reach `finished`/mailed (server-enforced)**.
  Content is **1–n sections**, each with its own title, its own **1–3 column** layout
  (1-col = label|value rows), and its own questions; each question carries a
  **datatype** that drives the field-app input control **plus optional per-datatype
  validation `constraints` (in v1 — number min/max, text maxLength, date bounds)**.
  Lifecycle
  **draft ⇄ active → disabled**, **no versioning in v1** (edit = pull to
  draft, re-activate) — only *active* templates ever reach the field app; disabling is
  terminal and requires an audited reason (dialog). **Captured reports snapshot their
  answers** (`templateId` + per-answer label/datatype at capture — 06 §5.5), so
  template edits never blank historical reports; **template status gates starting
  captures only — offline sync always accepts**. Tenants are **seeded with the
  current HVAC report as a starter template** at provisioning (existing reports
  retro-linked to it). Backend + field-app
  rendering obligations in `backend/manttio-whitelabeled-backend-plan.md` §3.
- **Client vs customer naming:** the product's existing `customers` resource **is** the
  "Clients" module here. Superadmin uses the word *client* in UI copy; code keeps `customers`
  to stay aligned with the backend module. CRM fields (status/source/blacklist) extend that
  same resource — see 07/08.
- **CFDI stamping (real SAT invoicing via a PAC)** is **deferred indefinitely — decided
  2026-07-05**: no invoice generation until way later, no PAC evaluation needed now.
  Billing v1 stores the client's fiscal data + internal billing records only; the data
  models just stay extensible (see 07/09).

---

## 5. Build-phase tracker — every open item, one page (added 2026-07-05)

Consolidated index of everything still undecided or owed across all plans, grouped by
*when it bites*. **The per-module "Open decisions / asks" ledgers stay the source of
truth** — resolve there first, then strike the line here **in the same commit**. An
agent hitting a checkpoint checks this page for items tagged to it.

### 5.1 Long poles — start before the module that needs them

- [ ] **Google Cloud project + sensitive-scope verification** (12 §7) — takes weeks,
      blocks 12 CP-5. Kick off as soon as building starts, not when 12 does.
- [ ] **Font catalog build** (03 §2.1) — latin subsets + 400/600/700 static instances +
      tnum verification for all 10 families, uploaded to `branding-fonts`. Needed by
      03 CP-2 (font pickers).

### 5.2 Decide-by-checkpoint

- [x] ~~02 CP-2 — Commissioner `tnum` check~~ — **resolved 2026-07-06: tnum is a
      no-op in Commissioner; `font-data` heads with Atkinson Hyperlegible** (01
      Typography).
- [x] ~~04 CP-2 start — rich-text control~~ — **resolved 2026-07-06: minimal custom
      contenteditable CVA** (no Quill dep; whitelist + paste-as-plain-text).
- [x] ~~06 CP-1 — confirm report status enum + folio~~ — **resolved 2026-07-06:**
      enum confirmed (`created|in-progress|finished|mailed`); folio has no backend
      column yet (backend ask).
- [ ] 06 CP-2 — resend-email action: in or out for v1.
- [~] 07 CP-1 — net-new `customers` columns implemented frontend-side as proposed
      (status, source, blacklistReason, nextFollowUpAt, referredByCustomerId, tags,
      contacts, fiscal); `source` enum shipped as the seven-value list — backend
      migration still owes confirmation.
- [ ] 10 (replenishments) — **SheetJS-on-Workers CPU check** with the backend agent;
      validate the import column set (`sku`, `quantity`, `serial`) against a real
      provider list.

### 5.3 Backend-coordination calls (mirror `backend/manttio-whitelabeled-backend-plan.md`)

- [ ] Manager push schema finalization (14): `scheduling` flag — calendar + contracts
      together or split; `crm` flag separate or rides core clients; equipment rides
      core clients; tenant timezone field.
- [ ] 05 — temp-password expiry in/out; restore endpoint for soft-deleted users in/out;
      voluntary password-change profile page (endpoint exists regardless).
- [ ] 07 — fiscal block nested vs flat in responses; 360 summary strip via
      `GET /customers/:id/summary` vs detail fields; tags `text[]` vs normalized table.
- [ ] 08 — status transition endpoint vs plain PATCH; which system-event emitters ship
      v1; source-stats endpoint for the dashboard card v1 or later.
- [ ] 09 — overdue derived vs stored; folio format (per-tenant consecutive).
- [ ] 10 — tracking-mode immutability after first movement; serialized consumption:
      `consumed` status vs virtual location; nesting depth (one sub-level enough?);
      van-as-sub-warehouse assumption; inbound dialog vs `replenishment` reason.
- [ ] 12 — report→visit closing heuristic; `missed` auto-sweep cron (same infra as
      13's expiry cron).
- [ ] 13 — visit generation upfront vs rolling; `active → expired` cron; Spanish
      contract-type label wording.
- [~] 15 — ~~public **published-only** CMS read routes for the website~~ — **shipped
      2026-07-07 (PR #54): `GET /public/cms/home|clients`**. Still open: whether
      published docs ride the `TenantCacheDO` with publish-time invalidation
      (backend plan §6).

### 5.4 Cross-module asks (coordinate, never build the other side)

- [ ] 05 ↔ 06 — shared delete-dialog base component (extract only if both agree).
- [ ] 07 ← 08/09/11/12/13 — customer-view reserves card slots: CRM timeline, bills,
      equipment, upcoming visits, contracts.
- [ ] 10 ↔ 11 — serialized-unit-consumed → equipment auto-create hook (v1 or later;
      `materialUnitId` FK direction).
- [ ] 05 ← 10 — user detail shows assigned warehouse (read-only link).
- [ ] 05 ← 12 — technician color assignment (v1 fallback: hash from user id).
- [ ] 06 ↔ 11 — equipment badges/links on report-view when both land.

### 5.5 Field-app work orders (fork `frontend/`, outside these plans)

- [ ] **Dynamic capture forms from templates** (06 §5): datatype → control, constraint
      enforcement, template picker (>1 active), answer-snapshot submission.
- [ ] `mustChangePassword` forced-change dialog (shared `users` flag — 02 §3).
- [ ] Font migration Inter → brand CSS vars (defaults Work Sans/Rubik; keep
      `font-data`/Atkinson for numeric columns).
- [ ] Tailwind palette → CSS variables repoint with manttio fallbacks (both apps —
      03 §4).
- [ ] Upstream-style asks: explicit visit pick at capture (12); serviced-equipment pick
      at capture (11).

### 5.6 Revisit-on-demand (non-blocking — don't resolve preemptively)

- 03 — per-step scale override leanness; favicon/PWA regen on isologo change.
- 06 — images block position (fixed at end until a tenant asks).
- 08 — author-edit of manual timeline entries (default no); v2 deals + task entity.
- 12 — FullCalendar adoption; swap approval step; external-event title privacy;
  timeline logging of matched events; secondary calendars; overlay freshness cache.
- 13 — billing integration; contract PDF (póliza); `one_time_maintenance` prefill;
  v2 behavior-bearing types.
- 14 — per-warehouse self-checkout flag; office correcting report materials.
- Backend — refresh-token encryption; PDF font-embedding cost measurement.

---

## 6. Legacy plan

`manttio-whitelabeled-superadmin-plan.md` (CMS-only scope) is superseded; its
content was folded into `04-cms.md` (content) + `03-branding.md` (brand) and the file
now redirects here.
