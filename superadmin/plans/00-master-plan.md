# 00 — Superadmin master plan

**App:** `superadmin/` — the whitelabeled in-product admin. A logged-in **client** (tenant
owner/staff) manages their own instance: users, reports, billing, clients + CRM, CMS, and a
small warehouse system. Tenant-scoped, product-user-authed — **never** the shared token.

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
| 03 | `03-users.md` | Users management | 02 |
| 04 | `04-reports.md` | Reports browser | 02 |
| 05 | `05-billing.md` | Billing + billing-by-reports | 02, 04, 06 |
| 06 | `06-clients.md` | Clients directory + Mexican invoicing info | 02 |
| 07 | `07-crm.md` | Light CRM: status, source, blacklist, activity timeline, follow-up date | 06 |
| 08 | `08-cms.md` | Webpage CMS (home + clients sections, brand view) | 02 |
| 09 | `09-wms.md` | Warehouse management: locations, materials, replenishments (file import + evidence), technician stock, report material tracking | 02, 03, 04 |
| 10 | `10-access-control.md` | Roles + tenant-config gating matrix (reference, binding for all modules) | — |
| 11 | `11-equipment.md` | Client equipment/asset registry + per-unit service history | 06; hooks 04, 09 |
| 12 | `12-calendar.md` | Scheduled visits + team calendar (reassign, tech swap; in-app only) | 02, 03, 06 |
| 13 | `13-contracts.md` | Maintenance contracts (pólizas) → generate visits into 12 | 06, 12; 11 opt. |

Build order: **01 → 02** are prerequisites for everything. After 02 lands, **03, 04, 06, 08**
can run in parallel (independent agents). **07** starts after 06's data model checkpoint;
**05** after 04 + 06; **09** after 03 + 04. Second wave: **11** after 06; **12** after
03 + 06; **13** after 12's CP-1 (visit entity) — contracts generate visits, so the
calendar's entity must exist first.

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
   until the endpoints exist.

---

## 3. Progress board

| Module | Status | Checkpoint |
|---|---|---|
| 01 conventions | done (doc) | — |
| 02 app-shell | not-started | — |
| 03 users | not-started | — |
| 04 reports | not-started | — |
| 05 billing | not-started | — |
| 06 clients | not-started | — |
| 07 crm | not-started | — |
| 08 cms | not-started | — |
| 09 wms | not-started | — |
| 10 access-control | done (doc) | — |
| 11 equipment | not-started | — |
| 12 calendar | not-started | — |
| 13 contracts | not-started | — |

*(Owning agents update their row when they update their file's status header.)*

---

## 4. Cross-module decisions (resolved here, not per-module)

- **Stack parity with `frontend/`:** Tailwind 3.4, PrimeNG Aura + manttio preset, NGXS
  (**decided 2026-07-05** — `@ngxs/*@^21` on Angular 21, compat verified), standalone +
  signals, zoneless. Details + porting tasks in `01-conventions.md` and `02-app-shell.md`.
- **Rendering: CSR now, SSR later — decided 2026-07-05.** Feature blocking by tenant
  config + user role ships client-side (boot-time `/auth/me`, centralized `access.ts`);
  the SSR move happens when client volume justifies it and is confined to the shell —
  upgrade path in `10-access-control.md` §5.
- **Roles — decided 2026-07-05:** baseline four (`owner`, `admin`, `office`,
  `technician`), full access matrix in `10-access-control.md` §2. Every module declares
  route `data: { module, roles }` and hides forbidden actions via the shared `hasRole`
  helper.
- **Soft deletes everywhere** user-facing (matches backend convention). Delete dialogs follow
  the `delete-user-dialog` canonical shape (audit comment + typed confirmation).
- **Audit records are append-only — decided 2026-07-05.** No audit trail (WMS movements
  today; any future one) is ever edited or deleted. Corrections are new compensating
  entries — in WMS, the `readjustment` movement type (`direction: in|out`, reason
  required, owner/admin only). See `09-wms.md` §1 and `10-access-control.md` §2.1d.
- **CRM scope — decided 2026-07-05** (target: small/medium service companies,
  independent providers): **no Deal/opportunity entity in v1** — lead stays a client
  status; **full append-only activity timeline** (`Interaction` entity, manual notes +
  system events, subsumes status history); follow-ups are a single `nextFollowUpAt`
  field, not a task system. v2 growth path (deals with fixed stages, task entity)
  recorded in `07-crm.md` open decisions.
- **CRM expansion — decided 2026-07-05:** the cheap high-value set ships with 06/07
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
  rendering by `code`). Instances: WMS `MovementReasonDef` (09 §1, owner/admin, locked
  built-ins) and `ContractTypeDef` (13 §1.1, owner-only, unlocked seeds). New extensible
  lists must reuse this shape.
- **Client vs customer naming:** the product's existing `customers` resource **is** the
  "Clients" module here. Superadmin uses the word *client* in UI copy; code keeps `customers`
  to stay aligned with the backend module. CRM fields (status/source/blacklist) extend that
  same resource — see 06/07.
- **CFDI stamping (real SAT invoicing via a PAC)** is **deferred indefinitely — decided
  2026-07-05**: no invoice generation until way later, no PAC evaluation needed now.
  Billing v1 stores the client's fiscal data + internal billing records only; the data
  models just stay extensible (see 05/06).

---

## 5. Legacy plan

`superadmin/manttio-whitelabeled-superadmin-plan.md` (CMS-only scope) is superseded; its
content was folded into `08-cms.md` and the file now redirects here.
