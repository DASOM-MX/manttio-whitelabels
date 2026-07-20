# 10-wms / 00 — WMS suite overview

> **Status:** not-started · **Depends on:** 02 (done), 05 (done), 06 (done)
> **Owner:** — · **Last updated:** 2026-07-19

This folder is the **expansion of `../10-wms.md`** (expanded 2026-07-19): the WMS was the
largest single module file, so it is now a **plan suite** — one sub-plan per submodule,
each ownable by one agent at a time, same checkpoint protocol as the master plan
(`../00-master-plan.md` §2). Every decision recorded in the original file **carries
forward unchanged**; where this suite adds a new decision it is marked
**proposed 2026-07-19** and listed in §6 for sign-off.

`../10-wms.md` now redirects here. Nothing outside this folder should deep-link the old
section anchors.

---

## 1. Sub-plans

| # | File | Scope | Depends on |
|---|---|---|---|
| 00 | `00-overview.md` | This file — index, invariants, routing map, asks ledger | — |
| 01 | `01-data-model.md` | Backend: tables, enums, relations, seeds, stock math, append-only enforcement | — |
| 02 | `02-api-surface.md` | Backend: endpoint catalog, validators, role gates, error codes, module layout | 01 |
| 03 | `03-warehouses.md` | Warehouses + sub-warehouses + technician assignment (orig. CP-1 + part of CP-4) | 01/02 shapes |
| 04 | `04-storage-hierarchy.md` | StorageNode tree inside a warehouse (orig. CP-2) | 03 |
| 05 | `05-materials-catalog.md` | Material catalog + material view (orig. CP-3) | 03 |
| 06 | `06-stock-operations.md` | Movements, reasons, inbound/transfer/readjustment dialogs, self-checkout (orig. CP-4) | 04, 05 |
| 07 | `07-replenishments.md` | Bulk restock documents: field-mapped async file import (+ status polling), preview, evidence, view (orig. CP-5; pipeline reworked 2026-07-19) | 05, 06, 11 |
| 08 | `08-report-materials.md` | Report material tracking + staff corrections (orig. CP-6, part) | 06 |
| 09 | `09-technician-surfaces.md` | "Mi almacén" + "Consulta de stock" + role/polish closing sweep (orig. CP-6, part) | 06, 08 |
| 10 | `10-state-services-dtos.md` | Frontend plumbing reference: NGXS states, HTTP services, DTOs, constants, pipes | — (reference) |
| 11 | `11-processing-service.md` | The batch-processing system — **its own project in its own repository** (`../manttio-processor` sibling): DB-as-queue job loop + the replenishment-import handler; this file is the cross-repo contract | 01, 02 |

**Build order:** 01 → 02 backend-side, with **11 (the external processing service)
starting any time after 01/02 fix the import contract** — it's a separate repo on its
own cadence; 03 → 04/05 (parallel) → 06 → 07/08 (parallel) → 09 frontend-side. 10 is
a reference doc kept current by whichever agent touches the plumbing. Frontend
checkpoints can start against mocked services as soon as 01/02 fix the shapes (master
plan §2 rule 5); anything server-enforced (self-checkout, append-only, type↔reason
validation) still needs the backend before its manual pass can close, and 07's manual
pass additionally needs 11 deployed (imports without the service just sit in
`queued`).

**PR granularity:** one PR per checkpoint, stacked, base `main` (re-check bases before
merging — GitHub does not auto-retarget). Branch naming
`feature/superadmin-wms-<submodule>`; backend branches
`feature/backend-wms-<slice>`. Commit prefixes `feat(superadmin)` / `feat(backend)`;
`fullstack` when a PR spans both.

## 2. Binding invariants (carried from the original plan — do not relitigate)

- **Roles are action-level, not module-level:** `../14-access-control.md` §2.1 is the
  binding matrix — owner/admin full; **office operational** (inbound, transfers incl. van
  loading, replenishment **prep** — approval is owner/admin only, §2.1e added
  2026-07-19; no structure/catalog, no readjustments); **technician** gets
  My warehouse (own van + consumption history + self-checkout) and Stock lookup (global
  read-only). **Reuse components with locked filters + hidden actions; never fork
  variants** (§2 note 2).
- **Movements are append-only, forever** (decided 2026-07-05; master plan §4): no
  UPDATE/DELETE path in backend code, no edit/delete affordance in UI, period. Every
  correction is a new `readjustment` movement (owner/admin, `direction: in|out`, reason
  required, notes required). Same principle as CRM interactions and visit assignments.
- **Movement reasons are data, not an enum** (tenant-customizable definition entity,
  master plan §4): `MovementReasonDef` with immutable auto-slugged `code`, editable
  `label`, `active` flag, deactivate-only. The 11 built-ins are backend-seeded and
  locked; owner/admin add custom reasons from inside the reason select.
- **Backend is the sole authority** — every endpoint enforces role + constraint on its
  own; superadmin guards/hiding are UX and bundle hygiene only.
- **No in-tenant module gating** (correction 2026-07-15, `../14-access-control.md` header):
  org-level module flags live in the whitelabels manager app; in this repo the WMS is
  gated by **role guards only** — `hasModule` returns true, `/auth/me` carries no
  `tenantConfig`. Do not build flag plumbing. (The original file's "behind the tenant
  `wms` config flag" line is superseded.)
- **Soft deletes** for warehouses and materials; movements/replenishments are never
  deleted at all. Delete dialogs follow the audited delete-dialog convention.

## 3. Conventions deltas since the original file (2026-07-05 → now — binding)

The original §3/§4 predate several app-wide rules. Where it conflicts, **this list wins**:

- **HTTP services live in `src/app/services/http/`** (not `src/http/`) — one service per
  resource, split per `10-state-services-dtos.md` §2. Theme/table services stay siblings
  under `app/services/`.
- **Constants live in `src/app/model/constants/wms/`** — **one constant per
  `<name>.const.ts` file** (the original's `data/dtos/wms/movement-reasons.ts` is
  superseded; special-case reason codes go to
  `model/constants/wms/special-reason-codes.const.ts`).
- **Every list page rides `ListQueryService`** (01-conventions, binding 2026-07-08):
  filters + page persist as GET params, `queryParamMap` is the single load path,
  sanitize on read. Canon: `users/pages/users-list/`.
- **Guards one-per-file in `app/guards/`**; shared types in `app/data/types/<domain>/`.
- **No `index.ts` barrels** — import concrete files.
- **No inline function calls in templates** — computed signals, getters, or pure pipes in
  `app/pipes/`; per-row label/severity mappings are pipes over constants maps.
- **Read-only data never renders as disabled inputs** — display rows/text (report-view
  style). `form.disable()` is not a read-only UI.
- **Row-click pattern** (05 §3 / QA 2026-07-09): list rows click through to the view;
  action cells stop propagation; action links stay the keyboard path.
- **Backend enums are string-valued TS `enum`s** (`z.nativeEnum`, `.$type<TheEnum>()`) —
  see `backend/CLAUDE.md` module layout. Frontend DTOs keep string-literal unions +
  label-map constants + pipes.
- **Colors:** keep `sky`/`granite` scales — the semantic rename is plan 16, deferred
  post-MVP.
- Superadmin is **Angular 21**; motion via `animate.enter`/`animate.leave` +
  `animations.scss` tokens; the `superadmin-design` skill is binding for every component.

## 4. Routing map (shell wiring is already live — do not re-create)

The shell (02) already ships: route area `/warehouse` in `app.routes.ts` with
`data: { module: 'wms', roles: ['owner','admin','office','technician'] }` lazy-loading
`wms/wms.routes.ts` (currently `ModuleStub`), nav entry **Almacén** (staff `NAV`) and
technician entries **Mi almacén** (`/warehouse`, exact) + **Consulta de stock**
(`/warehouse/stock`) in `TECH_NAV` (`model/constants/access/nav-entries.const.ts`).

Target route table for `wms.routes.ts` (order matters — literals before `:id`):

| Path (under `/warehouse`) | Page | Route roles | Sub-plan |
|---|---|---|---|
| `''` (technician match) | `my-warehouse` | technician | 09 |
| `''` (staff match) | `warehouses-list` | owner/admin/office | 03 |
| `stock` | `stock-lookup` | technician | 09 |
| `materials` | `materials-list` | owner/admin/office | 05 |
| `materials/:id` | `material-view` | owner/admin/office | 05 |
| `replenishments` | `replenishments-list` | owner/admin/office | 07 |
| `replenishments/new` | `replenishment-register` | owner/admin/office | 07 |
| `replenishments/:id` | `replenishment-view` | owner/admin/office | 07 |
| `:id` | `warehouse-view` | owner/admin/office | 04 |

- The dual `''` resolves with **two route records guarded by `canMatch`** — a
  `technician-only.guard.ts` first, staff record second (guards one-per-file in
  `app/guards/`). Both declare full route `data` (module + roles).
- **Staff sub-nav = nav children on the Almacén entry** (existing Clientes/CMS pattern):
  `Almacenes` (`/warehouse`, exact) · `Materiales` (`/warehouse/materials`) ·
  `Reabastecimientos` (`/warehouse/replenishments`). No custom tab bar component.
- UI copy is Spanish (Almacén, Materiales, Reabastecimientos, Movimientos, Ajuste,
  Traslado, Entrada); code stays English (`wms/`, `warehouses`, `materials`, …).

## 5. Cross-module asks ledger (coordinate, never build the other side)

- **05 users:** user detail shows the technician's assigned warehouse read-only, linking
  to `warehouse-view` (05 already records the ask). The assignment write lives here (03).
- **06 reports:** report-view has a reserved materials slot — 08 mounts
  `report-materials-editor` there. Slot markers exist (06 CP-2 shipped them).
- **11 equipment:** serialized-unit-consumed-on-install → offer/auto-create `Equipment`
  (`materialUnitId` backlink) — backend hook, coordinate when 08 lands (11 §1). 11 CP-3
  also waits on 05-materials' `material-view` to turn its plain `materialUnitId` into a
  link.
- **Backend:** everything in `01-data-model.md` / `02-api-surface.md`; consolidated
  obligations stay mirrored in `backend/manttio-whitelabeled-backend-plan.md` §3 (wms
  bullet) — keep both in the same commit when a decision moves. Note: the backend's JWT
  middleware still validates roles against `['owner','admin','technician']` — the
  **`office` role must land backend-side before WMS office gates work** (backend plan §1,
  ships with the users-module backend work).
- **Processing service (external repo — 11):** this suite owns the contract; the
  service repo consumes it. Ops asks before it can deploy: the `manttio-wms` bucket
  (02 §8) + **R2 S3 credentials (object read + delete — it purges processed source
  files)**, and the hosting-target decision (11 §5, owner's call).

## 6. Proposals introduced by this suite (proposed 2026-07-19 — veto here, not per-file)

Each is argued in its owning sub-plan; this is the sign-off index.

1. **Stock is materialized** (`stock_entries` / `material_units` updated in the same
   transaction as the movement insert); movements are the immutable journal — `01` §3.
2. **Serialized movements use a `movement_units` join table**, not an id array — `01` §2.
3. **Storage nodes soft-delete** (movement history references them forever) — `01` §2.
4. **Ad-hoc inbound rejects the `replenishment` reason** (`400 use_replenishment_flow`);
   the dialog excludes it and hints to the register page — resolves the original
   build-time decision — `06` §3.
5. **Compensating report-material movements carry reason `report_binding`** (its
   `appliesTo` seed extended to readjustments; still never user-selectable) — `08` §3.
6. **Dedicated `manttio-wms` R2 bucket** for replenishment source files + evidence photos
   (mirrors the `manttio-equipment` precedent) — `07` §4.
7. **Replenishment folio via a `wms_counters` row**, transaction-incremented (same
   pattern as `report_counters`, kept module-local) — `01` §2.
8. **Serialized consumption = unit `status` flip to `consumed`** (unit keeps its last
   location for history); no virtual "consumed" location — `01` §4.
9. **Five NGXS states / five HTTP services** split by sub-plan ownership (supersedes the
   original two-state sketch) — `10` §1.
10. **`MaterialUnitStatus.assigned` is reserved, unused in v1** (straight
    `in_stock → consumed` on save) — `01` §4.
11. **Storage-node roots may be any node type**; the only hierarchy rule is strictly
    descending type rank parent→child — `01` §2 (confirm with owner).
12. **Replenishment imports are field-mapped async batch jobs** (owner-directed
    2026-07-19, so the *direction* is decided — these are the implementation
    sub-decisions): `replenishment_imports`/`_rows` tables with lease/attempt
    columns and a `queued → processing → ready/failed` lifecycle (`01` §2),
    202-then-poll API with the DB row as status truth (`02` §6), 2.5 s
    `cancelUncompleted` polling with `?import=` resume (`07` §3.1), and the
    processing system as **its own project in its own repository**
    (`11` — proposed `manttio-processor`; DB-as-queue via `FOR UPDATE SKIP LOCKED`,
    per-tenant instance v1, no in-Worker fallback).
13. **Import source files are transient in R2** (owner 2026-07-19 — supersedes the
    2026-07-05 keep-forever evidence-file decision; reinforced same day: **uploads
    are copies, the tenant keeps the original**, so the binary has zero archival
    value): staged at upload as the processor's pull reference, **purged by the
    processor once fully processed** (`file_deleted_at` stamped), leftovers swept
    daily (`11` §5); the in-system record is the imported rows' `raw` + file name +
    mapping. Evidence photos stay permanent — `01` §4, `07` §4, `11` §3.
14. **Staging-then-approval** (owner 2026-07-19): processed data sits in the
    **staging (temp) table in the tenant DB** — mutable row fixes + evidence/notes
    prep all persist there — and only an **owner/admin approval** promotes it into
    the actual inventory tables (doc + items + movements + stock, one transaction);
    office prepares but never approves (`../14-access-control.md` §2.1e). Staged
    rows are **retained after promotion** (the only *in-system* record of what the
    file said — the tenant's original lives outside the system; physical cleanup
    would contradict the no-hard-deletes rule) — **owner said "move", so confirm
    retention vs cleanup explicitly** — `01` §2/§4, `02` §6, `07` §2.

## 7. Progress board (sub-plan owners update their row + their file header together)

| Sub-plan | Status | Checkpoint |
|---|---|---|
| 01 data-model | not-started | — |
| 02 api-surface | not-started | — |
| 03 warehouses | not-started | — |
| 04 storage-hierarchy | not-started | — |
| 05 materials-catalog | not-started | — |
| 06 stock-operations | not-started | — |
| 07 replenishments | not-started | — |
| 08 report-materials | not-started | — |
| 09 technician-surfaces | not-started | — |
| 10 state-services-dtos | reference doc | — |
| 11 processing-service | not-started (external repo) | — |

## 8. Glossary

- **Van / technician warehouse** — a warehouse (usually a sub-warehouse) with
  `assignedTechnicianId` set; one active warehouse per technician.
- **Movement** — one append-only journal row: `inbound` | `transfer` | `consumption` |
  `readjustment` (+ `direction` on readjustments), always with a structured `reason`.
- **Self-checkout** — a technician-executed transfer with destination locked to their own
  van and source excluding other technicians' warehouses; reason fixed `relocation`.
- **Replenishment** — a first-class bulk-restock document (folio, source file, evidence
  photos) whose confirmation emits the inbound movements.
- **Replenishment import** — the field-mapped async batch job behind a replenishment:
  upload → detected fields → user mapping → `queued` → processed by the external
  service into the **staging (temp) table** → `ready` review (row fixes + evidence +
  notes, all staged) → **owner/admin approval promotes it into inventory**.
- **Processing service** — the standalone batch-job runner in its own repository
  (11): claims `queued` imports straight off Neon (`SKIP LOCKED`), reads files from
  R2, writes rows + status back; superadmin only ever polls the DB-backed status.
- **Readjustment** — the only correction instrument; owner/admin, direction + reason +
  notes required.
