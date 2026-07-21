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
- **The whole replenishment lifecycle is audited** (owner 2026-07-20): every step
  from the start (upload) to admin/owner confirmation appends to
  `replenishment_import_events` (permanent, append-only) — `created`,
  `mapping_submitted`, `processing_started`/`processed`/`processing_failed`
  (system), `row_updated`/`row_removed`, `evidence_updated`, `notes_updated`,
  `rejected`/`resubmitted` (the reject→adjust→re-request cycle, owner 2026-07-20),
  `stale`, `cancelled` (owner-only full cancel, owner 2026-07-20), `approved`.
  **Governance tiers, each logged:** office preps/edits/resubmits; **row removal is
  owner/admin + reason-required**; **rejection is owner/admin + comment-required**
  (sends it back to office); **full cancel is owner-only + reason-required**
  (truncates staging, closes the record). Each submission also stores a human-readable
  `submission_snapshot` (file + mapping as plain-text JSON). Scoped to
  **replenishment imports only** — not a generic WMS edit audit (stock changes are
  already the `movements` journal). `01` §2, `02` §6.
- **Pending-approval + failure notifications** (owner 2026-07-20): a replenishment
  reaching `ready` (awaiting approval) or `failed` warns the configured
  **CMS-manager** — an app-shell **banner** in superadmin + an **in-app notification**
  raised via the notifications module. **v1 is in-app only — a warning *email* is deferred
  (owner 2026-07-21).** The recipient is a **config record**,
  `notifications.manager_user_id`, in the `settings` store (01 §2; provisioned at
  tenant setup); **unset ⇒ notifications skip silently**, the in-list pending strip
  is the floor, and the banner falls back to owner/admin so approvals aren't missed.
  Resolves the deferred "notify admins of pending approvals" item — `02` §6,
  `07` §2/§3, `11` §2.
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
  approval *moves* its rows into inventory and hard-deletes them; **owner-only cancel
  truncates them (required reason, logged as a `cancelled` event, owner 2026-07-20)**;
  the daily cron cleans staging of never-approved (`stale`/`failed`) imports (01 §2,
  11 §4). Staging is a temp workspace, not a user-facing entity — nothing else may
  cite this as precedent.

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
  provisioning (naming settled with the deploy tooling), and the two WMS buckets
  `manttio-wms-sheets` + `manttio-wms-evidence` (02 §8 — native bindings, no S3 credentials).
- **Notification recipient config:** the `notifications.manager_user_id` settings
  record (the CMS-manager who gets approval/failure warnings — §2) is set at tenant
  provisioning by the **whitelabel manager** (owner-provisioning precedent); an
  in-tenant owner settings screen to edit it is a later add. Coordinate the write
  side — don't build the manager tool here.

## 6. Proposals introduced by this suite (proposed 2026-07-19 — veto here, not per-file)

Each is argued in its owning sub-plan; this is the sign-off index.

**Sign-off status — ✅ LEDGER CLOSED (owner, 2026-07-20): all of #1–28 ratified** (each
annotated inline). **Modified during sign-off:** #4 (ad-hoc replenishment inbound now
allowed, admin-only, own trail — was a hard reject); #6/#13 (two buckets —
`manttio-wms-sheets` transient + `manttio-wms-evidence` permanent); #10 (`assigned`
activated — reservation + live location tracking); #12 (config stays in the Postgres
`settings` table — DB is source of truth — with a Durable Object as a read cache only);
#19 (in-flight scope → per **parent warehouse** via a
`parent_warehouse_id` partial-unique index, not runtime temp tables). **#3 ↔ #14 resolved:**
staged rows are ephemeral, true-move kept. **Now owed — a detail-propagation pass** folding
the modified items (#4, #6/#13, #10, #12, #19, #22) into their sub-plans (01/02/06/07/11);
**#10 still needs the reservation-flow answers** (trigger / release / available-vs-on-hand)
before it is fully buildable.

1. **Stock is materialized** ✅ *ratified (owner 2026-07-20)* (`stock_entries` /
   `material_units` updated in the same transaction as the movement insert); movements are
   the immutable journal — `01` §3.
2. **Serialized movements use a `movement_units` join table**, not an id array ✅ *ratified (owner 2026-07-20)* — `01` §2.
3. **Storage nodes soft-delete** (movement history references them forever) — `01` §2.
   **Accepted (owner 2026-07-20) and raised to a module-wide rule: NO hard deletes anywhere
   in WMS *except ephemeral pipeline artifacts*** — the transient R2 file copies (item 13)
   **and the staging scratch rows** (`replenishment_import_rows`). **Resolved 2026-07-20
   (owner): staged rows are the same ephemeral class as the file copies**, so #14's true-move
   (physical delete on approval), the owner-cancel truncate, and the `11` §4 stale-sweep all
   **stand** — the permanent record is the promoted doc + items + movements + the append-only
   event log + `submission_snapshot`. Every *domain entity* (warehouses, nodes, materials,
   reasons, movements, import headers, events) is soft-delete-only.
4. **Ad-hoc inbound MAY use `replenishment`, admin-only** (owner 2026-07-20, supersedes the
   original "reject with `400 use_replenishment_flow`"): occasional ad-hoc replenishment
   inbounds happen, so an **admin** (not office/technician) can pick the `replenishment`
   reason in the quick inbound dialog; each such movement stands as its **own trail entry**
   in the append-only journal (actor + reason, distinct from import-originated
   replenishments). The dialog hides it for non-admins (`403` if forced); the bulk path
   remains the audited import flow — `06` §3, `02` §4.
5. **Compensating report-material movements carry reason `report_binding`** ✅ *ratified (owner 2026-07-20)* (its
   `appliesTo` seed extended to readjustments; still never user-selectable) — `08` §3.
6. **Dedicated WMS R2 buckets** ✅ *ratified (owner 2026-07-20; two-bucket split per #13)* —
   **`manttio-wms-sheets`** for the transient replenishment source sheets (xlsx/csv/txt) +
   **`manttio-wms-evidence`** for the permanent evidence photos (opposite lifecycles →
   separate buckets; mirrors the `manttio-equipment` precedent, each with its own CDN base)
   — `07` §4, `02` §8.
7. **Replenishment folio via a `wms_counters` row**, transaction-incremented (same
   pattern as `report_counters`, kept module-local) ✅ *ratified (owner 2026-07-20)* — `01` §2.
8. **Serialized consumption = unit `status` flip to `consumed`** (unit keeps its last
   location for history); no virtual "consumed" location ✅ *ratified (owner 2026-07-20)* — `01` §4.
9. **Five NGXS states / five HTTP services** split by sub-plan ownership (supersedes the
   original two-state sketch) ✅ *ratified (owner 2026-07-20)* — `10` §1.
10. **`MaterialUnitStatus.assigned` is ACTIVE — inventory can be reserved for a visit**
    (owner 2026-07-20/21): lifecycle `in_stock → assigned → consumed`, location tracked
    throughout. **Reservation flow (owner 2026-07-21):**
    - **Trigger —** at **service/visit scheduling** the scheduler is prompted *"¿Desea
      reservar inventario para esta visita?"*; if yes, they earmark serialized units
      (→ `assigned`, `reserved_for` the visit/report) and/or lot/unserialized amounts.
      Reserved stock **stays at the source warehouse**, decrementing the **available**
      balance while **on-hand is unchanged**, until the technician resolves it.
    - **Resolution —** the technician records the **"last movement"** (prompted; the
      reservation must close via one): **(a) consume** on the report (consumption movement,
      `report_binding`; unit → `consumed`); **(b) move to my warehouse** — source→**van
      transfer** to the technician's own child warehouse; **(c) return to source** — release,
      stock stays at source (`assigned → in_stock`).
    - **Auto-return (owner 2026-07-21) —** a reservation **not consumed or moved** (to the
      technician's van) within the window is **automatically returned to its source
      warehouse** (released → `in_stock`), **default 3 days**, set via the
      `wms.reservation_auto_return_days` settings key; a daily cron sweeps them.
    - **Owners —** the scheduling prompt is a **calendar/visits (12)** [or reports (06)]
      hook; WMS (`06`/`08`/`09`) owns the hold + the resolution movements + the auto-return
      cron. ⚠️ *Open sub-details: confirm the available-vs-on-hand mechanic; whether
      lot/unserialized reservations ride a `stock_reservations` row vs `assigned` — settle
      when 12 lands.* — `01` §2/§4, `06`, `08`, `09`, `12`.
    - **Build order (owner 2026-07-21) —** this reservation slice is **gated on 12's visit
      entity** (reservations are raised at visit scheduling), so **12 is built first**; the
      rest of WMS (warehouses/materials/stock/replenishments/stocktake) is independent of 12.
11. **Storage-node roots may be any node type** — **confirmed (owner 2026-07-20): a root is
    simply any node with *no parent*** (any type qualifies); a node *with* a parent is a
    child and must obey the strictly-descending type-rank rule parent→child — `01` §2.
12. **Replenishment imports are field-mapped async batch jobs** (owner-directed
    2026-07-19, so the *direction* is decided — these are the implementation
    sub-decisions): `replenishment_imports`/`_rows` tables with a
    `queued → processing → ready/failed` lifecycle (`01` §2 — `attempts` mirrors
    queue delivery; the lease columns died with the daemon design),
    a 202-then-listen API with the DB row as status truth (`02` §6 — **SSE status
    stream**, owner 2026-07-19: push over poll, server closes at the terminal
    event; one-shot GET for loads/`?import=` resume — `07` §3.1), a **generic `settings`
    key-value store** whose first key remembers the last field mapping for mapper prefill
    (owner 2026-07-19 — `01` §2; **owner 2026-07-21: config stays in the Postgres `settings`
    table — the DB is the source of truth — with a Durable Object used _only_ as a read
    cache** in front of it (write-through + invalidate on `setSetting`, the existing
    `TenantCacheDO` pattern); accessors stay `getSetting`/`setSetting`), and processing
    via the backend's **Cloudflare Queues consumer** (`11` — **decided 2026-07-19**
    after the external-repo microservice / Node daemon / per-tenant-vs-registry
    iterations were judged overcomplicated: platform delivery, retries, DLQ, and
    hard timeouts; native R2/DB bindings so no credential registry; per-tenant for
    free via the per-tenant backend deploys. The DB-first contract keeps later
    extraction to an external service possible without API changes).
13. **Import source files are transient in R2** ✅ *ratified (owner 2026-07-20)* (owner
    2026-07-19 — supersedes the 2026-07-05 keep-forever evidence-file decision; reinforced
    same day: **uploads are copies, the tenant keeps the original**, so the binary has zero
    archival value): staged in the **`manttio-wms-sheets`** bucket at upload as the consumer's pull
    reference, **purged by the queue consumer once fully processed** (`file_deleted_at`
    stamped), leftovers swept by the daily cron (`11` §4); the in-system record is the
    imported rows' `raw` + file name + mapping. **Evidence photos stay permanent in the
    dedicated `manttio-wms-evidence` bucket** (owner 2026-07-20, #6) — `01` §4, `07` §4,
    `11` §2.
14. **Staging-then-approval** ✅ *ratified (owner 2026-07-20)* (owner 2026-07-19): processed data sits in the
    **staging (temp) table in the tenant DB** — mutable row fixes + evidence/notes
    prep all persist there — and only an **owner/admin approval** promotes it into
    the actual inventory tables (doc + items + movements + stock, one transaction);
    office prepares but never approves (`../14-access-control.md` §2.1e).
    **Resolved 2026-07-19 (owner): true move — the staged rows are physically
    deleted in the approval transaction** (the sanctioned no-hard-deletes
    exception, §2; the record is the promoted doc + items + movements + the import
    header's file name/mapping); never-approved staging is cron-cleaned — `01`
    §2/§4, `02` §6, `11` §4.
15. **Unprocessable rows** ✅ *ratified* (owner 2026-07-20): **serial** collisions
    (`duplicate_serial` repeats, `serial_exists`) **don't block approval** — they
    promote as flagged, movement-less `replenishment_items` (`unprocessable: true`
    + error code), visible in the document and counted on the list, so
    owner/admin/office see the duplicate and review records / contact the provider.
    Fixable errors (`unknown_sku`, `bad_quantity`, `missing_serial`, `missing_lot`,
    `bad_expiry`, `quantity_on_serialized`) still gate approval; both classes stay
    PATCH-fixable pre-approval. **Lot collisions are not errors** — re-receipt
    tops up (item 16) — `01` §2, `02` §6, `07` §2.
16. **Lot tracking** ✅ *ratified* (owner 2026-07-20 — confirmed a third tracking mode):
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
17. **`scrap` movement reason** ✅ *ratified* (owner 2026-07-20): built-in seed, Merma,
    `readjustment_out` — scrapped/waste material; serialized units it removes flip
    to `lost` like the other write-off reasons — `01` §5.
18. **`lot_expired` movement reason** ✅ *ratified* (owner 2026-07-20): built-in seed, Lote
    vencido, `readjustment_out` — manual write-off of an expired lot (the manual
    FEFO instrument); 13 seeded built-ins total now — `01` §5.
19. **One in-flight import per PARENT WAREHOUSE** (owner 2026-07-20 — was per-tenant): a new
    replenishment import can't start while another **for the same parent warehouse** is
    pre-approval (`uploaded`/`queued`/`processing`/`ready`); *different* parent warehouses
    import concurrently. **Mechanism (my correction to the "dynamic temp tables" idea):**
    *not* runtime-created temp tables — Postgres `TEMP TABLE`s are session/connection-scoped
    and won't survive the multi-request async import lifecycle under the pooled WS driver, so
    they can't back a workflow that spans upload → async process → review → approve. Instead
    keep the **one shared staging table** with the in-flight **partial unique index keyed on
    `parent_warehouse_id`** (sub-warehouses/vans share their parent's slot) and scope all
    staging queries by parent warehouse — same outcome (one in-flight per parent warehouse,
    concurrent across warehouses), no runtime DDL. `409 import_in_progress`; register page +
    list CTA resume the existing one. **Mechanism confirmed (owner 2026-07-21):** the
    `parent_warehouse_id` index (not temp tables), and the flow is **warehouse-first** — the
    destination is chosen before upload, so the import is warehouse-bound from creation and
    the guard binds at **upload** (no warehouse-less drafts) — `01` §2, `02` §6, `07` §2.
20. **Whole-lifecycle replenishment audit** ✅ *ratified* (owner 2026-07-20, new table
    `replenishment_import_events`): an append-only event log spanning the entire
    import — `created` (start) → `mapping_submitted` → processing (system) →
    `row_updated`/`row_removed` → `evidence_updated`/`notes_updated` →
    `rejected`/`resubmitted` → `stale` | `cancelled` | `approved` (confirmation).
    Each mutating endpoint emits its event in-transaction;
    the log is permanent and **survives approval** (staged rows are gone, the log +
    `submission_snapshot` stay). Row **removal is owner/admin only, reason-required**
    (office edits quantities but cannot remove); each submission also freezes a
    human-readable plain-text-JSON `submission_snapshot` (file + mapping). Read via
    `GET .../audit`; surfaced as a **"Historial" tab** on the approval-request
    (register) screen **and** on the confirmed `replenishment-view` details — one
    reusable timeline component (owner 2026-07-20; supersedes the earlier
    review-panel-only placement, which kept it off the view). Guards against silent
    quantity fiddling / row removal — `01` §2, `02` §6, `07` §2, `14` §2.1e.

### Low-cost / high-value batch (proposed 2026-07-20 — ✅ all signed off, owner 2026-07-20)

Cheap because the plan already has the bones; grouped by intent. 21–23 are the
**correctness insurance** I'd land first (each guards a place this system can lose
money silently); 24–27 are **owner-delight** (≈ one column + one pill each); 28 is
**dev velocity**. None is built until vetoed-in here.

21. **Idempotency key on stock-mutating endpoints** ✅ *accepted (owner 2026-07-20)* —
    client-generated
    `Idempotency-Key` header on `POST /stock/inbound|transfer|readjust` + a partial
    unique index `movements(idempotency_key) WHERE idempotency_key IS NOT NULL`; a
    replay returns the original movement, never a second one. **Why:** technicians
    run the offline PWA over flaky field links, so a retried self-checkout would
    otherwise duplicate the movement and silently double a balance. One column + one
    header + one index — `01` §2 (movements), `02` §4, wires into the offline queue
    (`frontend/src/offline/`).
22. **Quantities are integer/`numeric`, never JS float** ✅ *accepted (owner 2026-07-20, with
    a future path)* — a stated stock-math
    invariant across movements, `stock_entries`, `material_lots`, and staged rows;
    the mapper coerces and rejects non-integer quantity cells (`bad_quantity`).
    **Why:** materialized balances compound rounding drift — free to fix today, a
    data-cleanup job later — `01` §3 stock-math.
    **Future precision (owner 2026-07-20):** when unit-bearing quantities are introduced
    (cm/m/ml/L/gal/inch…), store *those* quantities **as plain text and parse on read** to
    avoid float rounding — integers stay the default until a tenant needs the finer units.
23. **`requires_note` flag on movement reasons, forced for `scrap` + `lot_expired`** ✅ *accepted (owner 2026-07-20)*
    — a boolean on `MovementReasonDef` (seeded true for the write-off reasons); the
    readjust/consumption validators reject a blank note when the chosen reason sets
    it (`400 note_required`). **Why:** an inventory drop with no explanation is the
    weak point in the audit posture we just built — `01` §5, `02` §4, `06` §3.
24. **Reorder-point surfacing** ✅ *ratified (owner 2026-07-20)* (data model *already* has it) — `minStock` + the
    computed `lowStock` flag + `?lowStock=` filter already exist (`02` §3); this is
    **frontend surfacing only**: a "bajo mínimo" pill on the materials list, a filter
    toggle, and a count badge (later: staff dashboard). No new column — `05`
    materials-list.
25. **Barcode scan via native `BarcodeDetector`** ✅ *ratified (owner 2026-07-20)* — materials already carry `upc`
    and every search box resolves it (`02` §3); add an optional "escanear"
    affordance (camera → `BarcodeDetector` → fills the search/lookup field) on the
    technician stock-lookup and material search. Zero dependency (native on the
    Android field fleet), graceful fallback to typing — `05`, `09`.
26. **Import summary counters before approval** ✅ *ratified (owner 2026-07-20)* — the ready-review summary strip
    (`07` §2 step 8) gains a computed `{ nuevos · reabastecimientos (top-ups) · no
    procesables }` breakdown from the staged rows, so the approver signs off on an
    informed count, not a blind total. One aggregate over staging; strengthens the
    approval gate — `07` §2, `02` §6 (fold into the preview payload).
27. **Stock export to Excel/CSV** ✅ *ratified (owner 2026-07-20)* — the mirror of the import: `GET /materials/export`
    streaming current balances (material, sku/upc, tracking, per-location qty) as
    csv/xlsx (owner/admin/office). Reuses the field concepts in reverse; the data
    already exists — `02` §3/§4, surfaced from the materials list.
28. **WMS seed/demo fixture** ✅ *ratified (owner 2026-07-20)* — a dev-only seed (2 warehouses + a node tree + a few
    materials across all three tracking modes, no live import) so the five frontend
    sub-plans build against real shapes before 11's consumer is live. Behind the
    `wms-test-` fixture prefix, never shipped — `01`/`02` testing.

### Stock reconciliation — physical-count sessions (proposed 2026-07-21 — owner-requested)

29. **Physical-count reconciliation (stocktake)** — the systematic way to keep system stock
    consistent with the real physical count; owners/admins won't reconcile a warehouse one
    `readjust` dialog at a time. **Model (owner 2026-07-21): a count *session* record is a
    time window** (`open → applied`) within which the reconciling **adjustment movements
    (`readjustment` ins/outs)** are performed — it reuses the existing readjustment
    primitive, so the movement audit trail stays intact.
    - **Tables —** `stock_count_sessions` (the window: `warehouse_id` + optional node scope,
      `status` `open`|`applied`|`cancelled`, `blind` snapshot, `opened_by`/`opened_at`,
      `applied_by`/`applied_at`, `notes`) + `stock_count_lines` (per `(material, location,
      lot?)`: `system_qty` snapshotted at open, `counted_qty`, derived `delta`). Movements
      emitted on apply carry a `count_session_id` backlink.
    - **Roles — office counts, owner/admin applies** (owner 2026-07-21; the replenishment
      prep→approve split): office (+ owner/admin) open a session and enter physical counts;
      **only owner/admin review the discrepancies and *apply*** — one transaction emits a
      `readjustment` in/out per non-zero delta under a **new built-in `stock_count` reason**,
      bringing system stock to the count. Sessions are append-only (a re-count is a new
      session).
    - **Blind vs informed — configurable, blind by default** (owner 2026-07-21): whether the
      counter sees `system_qty` while entering is set by a new **`wms.stock_count_blind`**
      settings key (default `true`); owners decide.
    - **Serialized —** the count reconciles the *found* unit set: units the system holds but
      not found → `readjustment`-out to `lost` (`stock_count` reason); unexpected found units
      are flagged (can't auto-add without a serial). **Confirmed (owner 2026-07-21): this
      found-set workaround is the v1 approach.**
    - **Lands in —** `01` (the two tables + `stock_count` reason + `count_session_id` on
      movements + the settings key), `02` (session endpoints: open / enter-counts / apply /
      cancel), `06` (the count-session UI + blind/informed count + discrepancy → apply flow),
      `14`/`09` (roles: office count, owner/admin apply). **Propagated into the sub-plans
      (owner 2026-07-21): 01 (tables + enum + `count_session_id` + `stock_count` reason),
      02 §4 (endpoints + error codes), 06 §8 (UI + flow + CP-4), 10 (StockState +
      DTO/const/pipe), 14 §2.1 (roles). Serialized-count handling: the found-set workaround
      is confirmed (owner 2026-07-21).**

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
  then the staged rows are deleted — the sanctioned exception, §2). From `ready`,
  owner/admin may instead **reject** it back to office with a comment (office adjusts
  + **resubmits** → `ready`); an **owner** may **cancel** it outright (truncate
  staging + close the record, reason required → `cancelled`); an abandoned/superseded
  import goes **`stale`** (cron-swept). Every branch is logged (item 20).
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
