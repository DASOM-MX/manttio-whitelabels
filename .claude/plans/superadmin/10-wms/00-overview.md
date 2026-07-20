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
| 07 | `07-replenishments.md` | Bulk restock documents: field-mapped async file import (+ SSE status stream), staged review, evidence, approval, view (orig. CP-5; pipeline reworked 2026-07-19) | 05, 06, 11 |
| 08 | `08-report-materials.md` | Report material tracking + staff corrections (orig. CP-6, part) | 06 |
| 09 | `09-technician-surfaces.md` | "Mi almacén" + "Consulta de stock" + role/polish closing sweep (orig. CP-6, part) | 06, 08 |
| 10 | `10-state-services-dtos.md` | Frontend plumbing reference: NGXS states, HTTP services, DTOs, constants, pipes | — (reference) |
| 11 | `11-processing-service.md` | Import processing — **Cloudflare Queues consumer in `backend/`** (decided 2026-07-19; supersedes the external-service iterations): queue/DLQ wiring, parse handler, platform retries, retention cron | 01, 02 |

**Build order:** 01 → 02 backend-side, with **11 riding the same backend deploy**
(build it alongside 02 CP-3 — it's a Queues consumer in `backend/`, not a separate
codebase); 03 → 04/05 (parallel) → 06 → 07/08 (parallel) → 09 frontend-side. 10 is
a reference doc kept current by whichever agent touches the plumbing. Frontend
checkpoints can start against mocked services as soon as 01/02 fix the shapes (master
plan §2 rule 5); anything server-enforced (self-checkout, append-only, type↔reason
validation) still needs the backend before its manual pass can close, and 07's manual
pass additionally needs 11's consumer live (without it, imports just sit honestly in
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
  `label`, `active` flag, deactivate-only. The 13 built-ins (incl. `scrap` +
  `lot_expired`, added 2026-07-20) are backend-seeded and locked; owner/admin add
  custom reasons from inside the reason select.
- **Backend is the sole authority** — every endpoint enforces role + constraint on its
  own; superadmin guards/hiding are UX and bundle hygiene only.
- **No in-tenant module gating** (correction 2026-07-15, `../14-access-control.md` header):
  org-level module flags live in the whitelabels manager app; in this repo the WMS is
  gated by **role guards only** — `hasModule` returns true, `/auth/me` carries no
  `tenantConfig`. Do not build flag plumbing. (The original file's "behind the tenant
  `wms` config flag" line is superseded.)
- **Soft deletes** for warehouses and materials; movements/replenishments are never
  deleted at all. Delete dialogs follow the audited delete-dialog convention.
  **One sanctioned exception (owner 2026-07-19):** the import **staging** table —
  approval *moves* its rows into inventory and hard-deletes them; the daily cron
  cleans staging of never-approved imports (01 §2, 11 §4). Staging is a temp
  workspace, not a user-facing entity — nothing else may cite this as precedent.

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
- **Import processing (11 — Queues consumer in `backend/`):** ops asks before it
  runs: Workers **paid plan** (Queues prerequisite), per-tenant queue + DLQ
  provisioning (naming settled with the deploy tooling), and the `manttio-wms`
  bucket (02 §8 — native binding, no S3 credentials).

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
    sub-decisions): `replenishment_imports`/`_rows` tables with a
    `queued → processing → ready/failed` lifecycle (`01` §2 — `attempts` mirrors
    queue delivery; the lease columns died with the daemon design),
    a 202-then-listen API with the DB row as status truth (`02` §6 — **SSE status
    stream**, owner 2026-07-19: push over poll, server closes at the terminal
    event; one-shot GET for loads/`?import=` resume — `07` §3.1), a **generic
    `settings` key-value store** whose first key remembers the last field mapping
    for mapper prefill (owner 2026-07-19 — `01` §2), and processing
    via the backend's **Cloudflare Queues consumer** (`11` — **decided 2026-07-19**
    after the external-repo microservice / Node daemon / per-tenant-vs-registry
    iterations were judged overcomplicated: platform delivery, retries, DLQ, and
    hard timeouts; native R2/DB bindings so no credential registry; per-tenant for
    free via the per-tenant backend deploys. The DB-first contract keeps later
    extraction to an external service possible without API changes).
13. **Import source files are transient in R2** (owner 2026-07-19 — supersedes the
    2026-07-05 keep-forever evidence-file decision; reinforced same day: **uploads
    are copies, the tenant keeps the original**, so the binary has zero archival
    value): staged at upload as the consumer's pull reference, **purged by the
    queue consumer once fully processed** (`file_deleted_at` stamped), leftovers
    swept by the daily cron (`11` §4); the in-system record is the imported rows'
    `raw` + file name + mapping. Evidence photos stay permanent — `01` §4, `07` §4,
    `11` §2.
14. **Staging-then-approval** (owner 2026-07-19): processed data sits in the
    **staging (temp) table in the tenant DB** — mutable row fixes + evidence/notes
    prep all persist there — and only an **owner/admin approval** promotes it into
    the actual inventory tables (doc + items + movements + stock, one transaction);
    office prepares but never approves (`../14-access-control.md` §2.1e).
    **Resolved 2026-07-19 (owner): true move — the staged rows are physically
    deleted in the approval transaction** (the sanctioned no-hard-deletes
    exception, §2; the record is the promoted doc + items + movements + the import
    header's file name/mapping); never-approved staging is cron-cleaned — `01`
    §2/§4, `02` §6, `11` §4.
15. **Unprocessable rows** (owner 2026-07-20): **serial** collisions
    (`duplicate_serial` repeats, `serial_exists`) **don't block approval** — they
    promote as flagged, movement-less `replenishment_items` (`unprocessable: true`
    + error code), visible in the document and counted on the list, so
    owner/admin/office see the duplicate and review records / contact the provider.
    Fixable errors (`unknown_sku`, `bad_quantity`, `missing_serial`, `missing_lot`,
    `bad_expiry`, `quantity_on_serialized`) still gate approval; both classes stay
    PATCH-fixable pre-approval. **Lot collisions are not errors** — re-receipt
    tops up (item 16) — `01` §2, `02` §6, `07` §2.
16. **Lot tracking** (owner 2026-07-20 — confirmed a third tracking mode):
    `lot`-tracked materials are batch consumables (nails, rivets, washers)
    technicians draw quantities from. `material_lots` balances keyed
    `(material, lot_number, location)`; movements carry `lot_number`; the import
    mapper gains **Lote** + **Caducidad** targets; inbound/transfer/readjust/
    consumption all take `lotNumber + quantity`.
    - **Re-receipt = top-up (enabled 2026-07-20):** a repeat lot number (in-file
      or in DB) adds to the lot's balance; it is not an error. Lot identity is
      `(material, lot_number)`.
    - **Expiry (enabled 2026-07-20, if the field is present):** `expires_at` per
      lot, display + warning pills; **manual FEFO** via the `lot_expired` reason
      (item 18) + expiry-sorted lot selects; consuming an expired lot on a report
      fires a **warn-confirm dialog** (08 §2). *Automatic* FEFO and *hard*-blocking
      expired consumption are parked — `01` §1/§2/§3, `08` §2.
17. **`scrap` movement reason** (owner 2026-07-20): built-in seed, Merma,
    `readjustment_out` — scrapped/waste material; serialized units it removes flip
    to `lost` like the other write-off reasons — `01` §5.
18. **`lot_expired` movement reason** (owner 2026-07-20): built-in seed, Lote
    vencido, `readjustment_out` — manual write-off of an expired lot (the manual
    FEFO instrument); 13 seeded built-ins total now — `01` §5.
19. **One in-flight import at a time** (owner 2026-07-20): a tenant may not start a
    new replenishment import while one is in a pre-approval state
    (`uploaded`/`queued`/`processing`/`ready`) — DB-enforced by a partial unique
    index, `409 import_in_progress`; the register page + list CTA resume the
    existing one instead of opening a second. ⚠️ Scope spec'd **per tenant** (one
    global in-flight); if warehouses are restocked concurrently by different staff,
    a **per-warehouse** scope may be wanted — confirm — `01` §2, `02` §6, `07` §2.

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
| 11 processing-service | not-started (Queues consumer in `backend/`) | — |

## 8. Glossary

- **Van / technician warehouse** — a warehouse (usually a sub-warehouse) with
  `assignedTechnicianId` set; one active warehouse per technician.
- **Tracking modes** — a material is `serialized` (one unit per piece, unique serial),
  `lot` (batch consumables — nails/rivets/washers; quantity within an identified lot;
  added 2026-07-20), or `unserialized` (quantity only).
- **Movement** — one append-only journal row: `inbound` | `transfer` | `consumption` |
  `readjustment` (+ `direction` on readjustments), always with a structured `reason`.
- **Self-checkout** — a technician-executed transfer with destination locked to their own
  van and source excluding other technicians' warehouses; reason fixed `relocation`.
- **Replenishment** — a first-class bulk-restock document (folio, source file, evidence
  photos) whose confirmation emits the inbound movements.
- **Replenishment import** — the field-mapped async batch job behind a replenishment:
  upload → detected fields → user mapping → `queued` → processed by the queue
  consumer into the **staging (temp) table** → `ready` review (row fixes + evidence +
  notes, all staged) → **owner/admin approval moves it into inventory** (promote,
  then the staged rows are deleted — the sanctioned exception, §2).
- **Import consumer** — the backend's Cloudflare Queues consumer (11): receives
  `{ importId }`, parses the staged file from R2, writes staging rows + status back
  to Neon, purges the binary; superadmin listens to the DB-backed **SSE status
  stream** (one-shot GET for loads/resume).
- **Unprocessable item** — a replenishment line whose serial collided (in-file
  repeat or already in DB): promoted at approval as a visible, flagged item with
  **zero stock effect** — an awareness artifact for record review / provider
  follow-up (owner 2026-07-20).
- **Readjustment** — the only correction instrument; owner/admin, direction + reason +
  notes required.
