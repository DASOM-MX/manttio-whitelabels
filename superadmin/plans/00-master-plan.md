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
| 02 | `02-app-shell.md` | App shell: platform decisions, auth gate, layout, nav, theming | 01 |
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

Build order **is numeric order** (renumbered 2026-07-05: branding and CMS are separate,
independent modules — 03/04 — and access-control moved to 14 as pure reference).
**01 → 02** are prerequisites for everything. After 02 lands, **03 + 04 go first —
branding + headless CMS are the whitelabel selling points** (independent of each other;
parallel agents). **05, 06, 07** run in parallel as capacity allows. **08** starts after
07's data-model checkpoint; **09** after 06 + 07; **10** after 05 + 06. Second wave:
**11** after 07; **12** after 05 + 07; **13** after 12's CP-1 (visit entity) —
contracts generate visits, so the calendar's entity must exist first.

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
| 02 app-shell | not-started | — |
| 03 branding | not-started · **priority: first after 02** | — |
| 04 cms | not-started · **priority: first after 02** | — |
| 05 users | not-started | — |
| 06 reports | not-started | — |
| 07 clients | not-started | — |
| 08 crm | not-started | — |
| 09 billing | not-started | — |
| 10 wms | not-started | — |
| 11 equipment | not-started | — |
| 12 calendar | not-started | — |
| 13 contracts | not-started | — |
| 14 access-control | done (doc) | — |

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
  numerals, skeletons), fluid anime.js motion via shared tokens, **no emojis ever,
  outlined icons only (`lucide-angular`)**, compact `h-12` control baseline — plus
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
  **datatype** that drives the field-app input control. Lifecycle
  **draft ⇄ active → disabled**, **no versioning in v1** (edit = pull to
  draft, re-activate) — only *active* templates ever reach the field app; disabling is
  terminal and requires an audited reason (dialog). Tenants are **seeded with the
  current HVAC report as a starter template** at provisioning. Backend + field-app
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

## 5. Legacy plan

`superadmin/manttio-whitelabeled-superadmin-plan.md` (CMS-only scope) is superseded; its
content was folded into `04-cms.md` (content) + `03-branding.md` (brand) and the file
now redirects here.
