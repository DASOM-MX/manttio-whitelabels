# 10-wms / 02 — API surface (backend)

> **Status:** in-progress — **§2 warehouses + storage nodes shipped 2026-08-21**
> (`modules/wms/`, first half of CP-1); §3 materials next · **Depends on:** 01
> **Owner:** — · **Last updated:** 2026-08-21

The complete WMS endpoint catalog: paths, role gates, validator shapes, responses, and
error codes. Follows `backend/CLAUDE.md` to the letter: thin controllers
(validate → service → respond), business rules in services, queries in repositories,
zod validators with inferred input types, error shape
`{ error: 'snake_case_code', message? }`.

**Role gates are explicit allow-lists** (`requireRole([...])` — no hierarchy in the
middleware; owner is always listed where admin is). ⚠️ The JWT middleware still
validates `['owner','admin','technician']` — the **`office` role must exist before the
office gates below work** (backend plan §1; ships with the users-module backend slice).
Binding matrix: `../14-access-control.md` §2.1.

---

## 1. Module layout — `backend/src/modules/wms/`

```
controllers/  warehouses.controller.ts      → mounted at /warehouses
              materials.controller.ts       → /materials
              stock.controller.ts           → /stock + /movements
              movement-reasons.controller.ts→ /movement-reasons
              replenishments.controller.ts  → /replenishments
              report-materials.controller.ts→ mounted at /reports (sub-route only —
                                              the reports module is NOT touched; Hono
                                              composes multiple routers per prefix,
                                              mount this one after reports' in index.ts)
services/     warehouses / materials / stock / movement-reasons / replenishments /
              report-materials / replenishment-imports (upload, field detection,
              enqueue → Queues, status reads) / import-processor (the **queue
              consumer's** parse+validate handler — `11-processing-service.md`;
              the request path never parses more than header + sample rows, and
              the handler shares its row-error modules with confirm-time
              revalidation)
repository/   one per aggregate; movements repo insert+select only (01 CP-2)
models/ · validators/ · enums/ · constants/ (STORAGE_NODE_RANK, seed reasons,
              import-template columns) · types/ · http-errors/ (typed domain errors →
              controller maps to status)
```

All routes sit behind the JWT middleware (no public WMS surface). Every list endpoint
is paged (`page`/`limit`, default 25, max 100) returning `{ items, total }`.

**Cross-cutting config store — `modules/settings/`** (added 2026-07-19): a generic
per-tenant **Postgres `settings` key-value table** (01 §2: `id · key · value` jsonb;
**new settings = new rows, never new columns**) exposed as `getSetting(key)`/
`setSetting(key, value)`, keys namespaced `<domain>.<name>`. **The DB is the source of
truth**; a per-tenant **Durable Object fronts it as a read cache** (owner 2026-07-21 —
rapid reads without a DB round-trip: reads hit the DO, `setSetting` writes through to the
table and invalidates/refreshes the cache, a cold DO loads from the table; the existing
`TenantCacheDO` DB-backed-cache pattern, **not** a replacement for the table). **No
controller in v1** — it's backend-internal; a settings API lands only when a user-facing
setting appears. First consumer: `wms.last_replenishment_mapping` (§6). Second key —
`notifications.manager_user_id` (owner 2026-07-20): the configured **CMS-manager**
who receives replenishment approval/failure warnings (01 §2), read via `getSetting`
by the replenishment notifier (§6, 11 §2); provisioned at tenant setup (no v1
controller — an in-tenant editor is a later add).

## 2. Warehouses + storage nodes — `warehouses.controller.ts`

| Endpoint | Roles | Notes |
|---|---|---|
| `GET /warehouses` | owner/admin/office/technician | Flat, `?parentId=` filter. Technician calls it for self-checkout source lists — service **excludes other technicians' warehouses** for them (a) |
| `GET /warehouses/tree` | owner/admin/office | Roots with nested subs + `assignedUser { id, name, role }` + per-warehouse `stockSummary { materialCount, unitCount }` — feeds the list page. **`assignedUser` supersedes `assignedTechnician`** (user 2026-08-21): the column became `assigned_user_id` + `assignment_role`, so the badge carries WHAT the person is to the location. `materialCount` counts distinct materials across the three tracking modes (a material has exactly one, so the three counts sum exactly); `unitCount` is total on-hand amount, mixed UoM summed — a "how loaded is this place" badge, not a valuation |
| `GET /warehouses/:id` | owner/admin/office + assigned technician (own van — 09) | Detail incl. derived `type` |
| `POST /warehouses` | owner/admin | `{ name, parentId?, address?, notes? }` — parent must be a root (`400 invalid_parent`) |
| `PATCH /warehouses/:id` | owner/admin | Same fields; re-parenting allowed while empty only |
| `DELETE /warehouses/:id` | owner/admin | Soft; empty-only (`409 warehouse_not_empty`); cascades soft-delete to its nodes |
| `POST /warehouses/:id/assign-technician` | owner/admin | `{ userId: uuid \| null, role?: AssignmentRole }` — null unassigns (and takes no role). **Path deliberately unchanged; the body gained `role`** (user 2026-08-21): assignee and role are stored together (`warehouses_assignment_role_check`), so an assignment without one cannot exist — a body with only one side is `400`. `role: technician` is the VAN marker and carries both rules: the user must actually hold the technician role (`400 not_a_technician`) and may hold only one van (`409 technician_already_assigned`, a service rule — a supervisor or leader may hold any number, which is why the index is not unique). Unknown user → `400 assignee_not_found` |
| `GET /warehouses/:id/nodes?parentNodeId=` | owner/admin/office + assigned technician | Lazy children (roots when param absent) with `hasChildren` |
| `POST /warehouses/:id/nodes` | owner/admin | `{ parentNodeId?, type, name, description?, locationReference?, assignedUserId?, assignmentRole? }` — rank rule (`400 invalid_parent_type`), name unique in parent (`409 duplicate_node_name`), parent must belong to this warehouse (`400 node_warehouse_mismatch`). The last four columns landed 2026-08-21; the write surface followed in the same pass (user), since a column with no endpoint is unreachable. Assignment is level-checked — only a `warehouse` or `storage_unit` node may carry one (`400 invalid_assignment_level`) — pairs user+role or neither (`400 incomplete_assignment`), and `assignmentRole: technician` still means an actual technician (`400 not_a_technician`) |
| `PATCH /warehouses/:id/nodes/:nodeId` | owner/admin | `{ name?, description?, locationReference?, assignedUserId?, assignmentRole? }` — **type immutable, no move in v1** (neither `type` nor `parentNodeId` is accepted). Nullable fields clear on `null`. The assignment pair is judged on the MERGED row, so `{ assignmentRole }` alone is a role change on an already-assigned node, while clearing one side alone is `400 incomplete_assignment` |
| `DELETE /warehouses/:id/nodes/:nodeId` | owner/admin | Soft; empty-only (`409 node_not_empty`) |
| `GET /warehouses/:id/stock?nodeId=` | owner/admin/office + assigned technician | Stock at the location: unserialized `{ material, quantity }[]` + serialized units in `in_stock` |

## 3. Materials — `materials.controller.ts`

| Endpoint | Roles | Notes |
|---|---|---|
| `GET /materials?search&tracking&lowStock&page&limit` | owner/admin/office/technician | Paged; `search` matches **name, sku, and upc** (exact-ish on the codes, ilike on name — a keyboard-wedge barcode scan into any search box resolves the material). Rows carry `totalStock` + `lowStock` (`totalStock < minStock`). Technician read = stock lookup (09) — same endpoint, no special casing |
| `GET /materials/:id` | owner/admin/office/technician | Detail |
| `GET /materials/:id/stock` | owner/admin/office/technician | Per-location breakdown `{ warehouse, node?, quantity }[]`; serialized adds the unit list `{ id, serialNumber, warehouse, node?, status }[]`; **lot adds the lot list** `{ lotNumber, warehouse, node?, quantity, expiresAt? }[]` (added 2026-07-20; `expiresAt` present only for tracked lots) |
| `POST /materials` | owner/admin | `{ sku?, upc?, name, description?, unit, tracking, minStock? }` (`409 sku_in_use` / `409 upc_in_use`; upc validated `^\d{8,14}$`) |
| `PATCH /materials/:id` | owner/admin | `tracking` rejected once movements exist (`409 tracking_immutable`) |
| `DELETE /materials/:id` | owner/admin | Soft; zero stock everywhere (`409 material_has_stock`) |

## 4. Stock operations + movements — `stock.controller.ts`

All three ops take a **required `reason`** validated against the def's `applies_to` +
`active` (`400 invalid_reason_context` / `400 reason_inactive`), and a payload
matching the material's tracking (`400 tracking_mismatch`): unserialized →
`quantity` · serialized → serial payload · **lot → `lotNumber` + `quantity`
(+ optional `expiresAt` on inbound)** (added 2026-07-20 — inbound creates or **tops
up** the lot at the destination; `expiresAt` sets the lot's expiry on first receipt,
ignored on top-up of an already-dated lot; transfer/readjust draw from that lot's
balance at the source, `409 insufficient_stock` per lot-location). Location payloads are `{ warehouseId, storageNodeId? }`; the
node must belong to the warehouse (`400 node_warehouse_mismatch`). Everything runs the
01 §3 transaction.

| Endpoint | Roles | Body |
|---|---|---|
| `POST /stock/inbound` | owner/admin/office | `{ materialId, to, quantity? \| serials?: string[] \| (lotNumber + quantity), reason, notes? }` — serialized inbound **creates the `material_units` rows** (`409 serial_exists`); lot inbound creates/tops-up the lot at `to`. Reason `replenishment` is **admin-selectable here** (owner 2026-07-20 — occasional ad-hoc replenishments, each its own append-only trail entry); **non-admins (office) still get `400 use_replenishment_flow`** — bulk restock stays a document (07). SUPERSEDES the blanket reject (proposed 2026-07-19) |
| `POST /stock/transfer` | owner/admin/office/**technician** | `{ materialId, from, to, quantity? \| materialUnitIds?: uuid[] \| (lotNumber + quantity), reason, notes? }` — units must be `in_stock` at `from` (`409 unit_not_available`); lot transfers draw from that lot's balance at `from`. **Technician = self-checkout, server-enforced:** `to` must be their assigned warehouse (`403 not_own_van`; none assigned → `409 no_assigned_warehouse`), `from` must not be another technician's warehouse (`403 source_forbidden`), reason forced `relocation` (`400 invalid_reason_context`) |
| `POST /stock/readjust` | owner/admin | `{ direction, materialId, at, quantity? \| materialUnitIds? \| (lotNumber + quantity), reason, notes }` — **notes required** (validator). Out on serialized flips units to `lost` when reason ∈ `damaged_material`/`stock_cleaning`/`doa`/`scrap` (else they leave stock as plain out); in restores/creates per reason. This is the only correction instrument |
| `GET /movements?materialId&warehouseId&nodeId&reportId&replenishmentId&lotNumber&type&reason&from&to&page&limit` | owner/admin/office/technician | Paged, newest first; `warehouseId` matches either side. Rows: type, direction?, reason `{ code, label }`, material, quantity/units, **lotNumber?**, from/to (warehouse+node names), user, report/replenishment links, notes, createdAt. **Technician scope (server-side):** only movements touching their own van or their own reports |

**No `PATCH`/`DELETE` route exists under `/stock` or `/movements` — do not add one.**

### Physical-count reconciliation — `stock.controller.ts` (owner 2026-07-21, §6 #29)

Stocktake modeled as a **count session = time window** (01 §2: `stock_count_sessions` +
`stock_count_lines`; status enum `open`|`applied`|`cancelled`). Applying a session emits
reconciling **`readjustment` movements** (reuses the existing primitive — the movement
audit trail stays intact) under the new built-in `stock_count` reason, each backlinked by
`count_session_id`. **Office counts, owner/admin applies** (`../14-access-control.md`
§2.1 — the same prep→approve split as replenishments; technicians excluded). **Blind is
server-enforced:** while a session is `open` and `blind=true`, `system_qty` is **withheld**
from the count-entry reads (revealed on the discrepancy/apply view and after apply);
`blind` is snapshotted from the `wms.stock_count_blind` setting (01 §2, default `true`,
read via `getSetting`) at open — flipping the setting later never changes an open session.

| Endpoint | Roles | Notes |
|---|---|---|
| `POST /stock/counts` | owner/admin/office | Open a session: `{ warehouseId, nodeId?, materialFilter? }` → snapshots `system_qty` per `(material, node, lot)` into `stock_count_lines`, sets `blind` from `wms.stock_count_blind`, `status: open` (+ `opened_by`/`opened_at`). Returns the session + lines (**`system_qty` withheld when `blind`**). Unknown warehouse/node → `400 invalid_parent` / `400 node_warehouse_mismatch` |
| `GET /stock/counts?warehouseId&status&page&limit` | owner/admin/office | Paged, newest first: session header (warehouse, node scope, status, blind, actors) + line/discrepancy counts |
| `GET /stock/counts/:id` | owner/admin/office | Session + lines (`404 count_not_found`); **`system_qty` withheld while `open`+`blind`** — revealed to the applier on the discrepancy view / after apply |
| `PUT /stock/counts/:id/lines` | owner/admin/office | Enter/update counted quantities: `{ lines: [{ lineId \| (materialId, nodeId?, lotNumber?), countedQty }] }`; only while `open` (`409 count_not_open`). Upserts by line key, re-derives `delta`, returns the updated lines (still blind-withheld) |
| `POST /stock/counts/:id/apply` | **owner/admin only** | One transaction: per **non-zero delta** emit a `readjustment` — **in** if `counted>system`, **out** if `counted<system` — reason `stock_count`, `count_session_id` set, through the 01 §3 path; serialized **out flips the missing units to `lost`**; sets `status: applied` (+ `applied_by`/`applied_at`). `409 count_not_open` if not `open`; `409 count_empty` when no counts were entered |
| `POST /stock/counts/:id/cancel` | owner/admin | `status: cancelled` (+ actor), **no adjustments emitted**; `open` only (`409 count_not_open`) |

**Append-only:** a re-count is a **new session**; no `PATCH`/`DELETE` on `/stock/counts`,
and an `applied`/`cancelled` session is terminal (its lines stay as the count record).

## 5. Movement reasons — `movement-reasons.controller.ts`

| Endpoint | Roles | Notes |
|---|---|---|
| `GET /movement-reasons` | any authenticated | Full list — active + inactive, `builtIn` flagged; clients filter for selects, history joins render inactive labels |
| `POST /movement-reasons` | owner/admin | `{ label, appliesTo: ReasonContext[] }` (≥1; `consumption` not offerable — reserved for `report_binding`). Code slugged server-side, collision-suffixed; returns the def |
| `PATCH /movement-reasons/:id` | owner/admin | `{ label?, active? }` — custom only (`403 builtin_locked`); `code` immutable. **No DELETE endpoint** |

## 6. Replenishments — `replenishments.controller.ts`

| Endpoint | Roles | Notes |
|---|---|---|
The import flow is **asynchronous with a field mapper and an approval gate**
(reworked 2026-07-19, owner ask): upload → server detects the file's fields → user
maps them to our columns in superadmin → mapping submitted → **batch job**
parses/validates into the **staging table** → frontend **listens on the SSE status
stream** until `ready` → prep (row fixes, evidence, notes — staged) → **approval
moves staging into the inventory tables** (promote + delete). Status truth lives in
`replenishment_imports` (01 §2) — the stream is a server-side watcher of that row,
the one-shot GET a plain read; where processing runs is an implementation detail
(today: the Worker's own Queues consumer — 11).
**Prep is owner/admin/office; approval is owner/admin only**
(`../14-access-control.md` §2.1e — the billing draft-vs-commit split).

**The whole lifecycle is audited (owner 2026-07-20):** every meaningful step
appends one `replenishment_import_events` row (01 §2) — `created` (upload/start),
`mapping_submitted`, `processing_started`/`processed`/`processing_failed` (system,
queue consumer), `row_updated`/`row_removed`, `evidence_updated`, `notes_updated`,
**`rejected`/`resubmitted`** (the reject→adjust→re-request cycle, owner 2026-07-20),
`stale`, **`cancelled`** (owner-only full cancel, owner 2026-07-20), `approved`
(confirmation → doc). Each endpoint below that mutates an
import emits its event in the same transaction; the log is append-only and permanent
(survives approval), read via `GET .../audit`.

| Endpoint | Roles | Notes |
|---|---|---|
| `GET /replenishments?warehouseId&from&to&page&limit` | owner/admin/office | Paged: folio, warehouse, itemCount, **unprocessableCount** (warning marker), evidenceCount, user, createdAt |
| `GET /replenishments/:id` | owner/admin/office | Doc + **`importId`** (backlink so the details page loads the audit via `GET .../imports/:id/audit` — owner 2026-07-20) + items (joined material name/sku/tracking; items carry `unprocessable` + `error`) + evidence keys + source-file **name** via the `import_id` join (metadata only — the binary is purged post-processing, 01 §4) |
| `POST /replenishments/imports` | owner/admin/office | Multipart `{ warehouseId, file }` (`.xlsx`/`.csv`/`.txt`, delimiter-sniffed; size cap 1 MB) — **warehouse-first (owner 2026-07-21): the destination is chosen before upload, so the import is warehouse-bound from creation.** Stages the file in R2 **first** (the reference the consumer pulls it by; transient — purged after processing, 01 §4), then does **lightweight field detection only** (header row + ≤5 sample values per column — cheap even via SheetJS) → creates the import row (`status: uploaded`, with `warehouse_id` + resolved `parent_warehouse_id` set) → `{ importId, fileName, fields: [{ id, header, samples }], suggestedMapping? }` — `suggestedMapping` (field-id-resolved) is returned when the saved last-mapping's headers match the detected ones (settings key `wms.last_replenishment_mapping`, read via `getSetting` — 01 §2). Unreadable file / unknown warehouse → `400 unparseable_file` / `400 invalid_parent`, no row created. Emits `created`. **One in-flight import per parent warehouse** (owner 2026-07-20 — was per-tenant): a partial unique index keyed on `parent_warehouse_id` yields **`409 import_in_progress` at upload** (parent known from creation — warehouse-first) when that parent warehouse already has an import in a pre-approval state (`uploaded`/`queued`/`processing`/`ready`/`rejected`) — the client resumes that one (07 §2) instead of opening a second. Enforced at the DB index, NOT via runtime temp tables (session-scoped, can't span the async lifecycle) |
| `POST /replenishments/imports/:id/process` | owner/admin/office | `{ mapping: { sku: fieldId, quantity?: fieldId, serial?: fieldId, lot?: fieldId, expiry?: fieldId } }` — the warehouse was already bound at upload (warehouse-first, owner 2026-07-21); `sku` required, plus at least one of `quantity`/`serial`/`lot` (`400 invalid_mapping`); `expiry` optional and only meaningful with `lot`; only from `uploaded` (`409 import_not_pending`). Stores the mapping, sets **`queued`**, sends `{ importId }` to the queue binding, **upserts the settings key `wms.last_replenishment_mapping`** (via `setSetting`) as `{ headers, mapping }` — keyed by **header text**, not field id (ids are per-import), so the next upload with the same headers prefills the mapper — and **writes `submission_snapshot`**: the whole submission (file name, warehouse, detected fields, mapping, submitter, timestamp) as **human-readable pretty-printed JSON stored as plain text** (owner 2026-07-20 — a durable, exportable audit of what was submitted and how it was mapped; survives approval on the permanent header) — and emits `mapping_submitted` → **`202 { status }`**. The **queue consumer** (11) walks the file per the mapping, resolves materials (SKU exact, then UPC exact), upserts `replenishment_import_rows` + progress counters, flips `ready`/`failed`. Row errors, two classes (owner 2026-07-20): **fixable** — `unknown_sku`, `bad_quantity`, `missing_serial`, `missing_lot` (lot-tracked row without a lot value), `bad_expiry` (unparseable value in the mapped expiry field), `quantity_on_serialized` (≠1) — gate approval until PATCHed clean; **unprocessable** — `duplicate_serial` (in-file: first occurrence processes, repeats flagged) and `serial_exists` (already in DB) — do NOT gate approval, they promote as flagged unprocessed items (see the approval row). **Lot collisions are NOT errors** (re-receipt enabled 2026-07-20): a repeat lot number, in-file or in DB, tops up that lot; in-file repeats aggregate their quantities. Both error classes stay PATCH-fixable pre-approval |
| `GET /replenishments/imports/:id` | owner/admin/office | **One-shot status read** (initial load, `?import=` resume, pending strip) — `{ id, status, fileName, fields, mapping?, submissionSnapshot?, progress: { total?, processed, errors }, error?, rejectionComment?, evidencePhotos, notes?, rows? }`; `rows` + `submissionSnapshot` present once processed; **`rejectionComment` present when `status = 'rejected'`** (derived — the latest `rejected` event's comment, so office sees the feedback without loading the full audit). Pure DB read |
| `GET /replenishments/imports/:id/events` | owner/admin/office | **SSE status stream** (owner 2026-07-19 — push over poll): `text/event-stream` via Hono's `streamSSE`. Emits the same payload as the GET on **every status/progress change** — the handler watches the DB row server-side (~2 s re-reads + a 15 s heartbeat comment) — and **closes itself after the terminal event** (no idle connections). Feasibility (confirmed 2026-07-20): Workers stream SSE natively — CPU time is metered, wall-clock while streaming is not, and these streams live seconds by design. Bearer-authed like every route; clients use a fetch-based reader, not `EventSource` (07 §3.1) |
| `PATCH /replenishments/imports/:id/rows/:line` | owner/admin/office | Edit a **staged row** (`ready`/`rejected` only — `409 import_not_ready`): `{ code?, quantity?, serial?, lot?, expiresAt?, storageNodeId? }` — editable on **any** row, not just errored ones (owner 2026-07-20): the **quantity** correction ("arrived 95, not 100") is a first-class edit, independent of parse errors. **`rejected` is editable too** so office can act on the admin's feedback before resubmitting. Server re-resolves (SKU-then-UPC) + re-validates and returns the row; **emits a `row_updated` event** (per-field before/after, actor) — 01 §2. Edits persist, survive reloads, carry across users. Frozen once approved |
| `DELETE /replenishments/imports/:id/rows/:line` | **owner/admin only** (office 403 — owner 2026-07-20: removal invites mismanagement, restrict it) | Remove a staged row (`ready`/`rejected` only) — body `{ reason }` **required** (audit comment). Emits a `row_removed` event (row snapshot + `reason` + actor) **then** deletes the staged row. The line is gone; the event is permanent |
| `GET /replenishments/imports/:id/audit` | owner/admin/office | **The whole-lifecycle event log** (owner 2026-07-20) — paged, newest first: `{ type, actor?: { id, name }, line?, reason?, details, createdAt }` across every event from `created` (start) to `approved` (confirmation). Read-only; feeds **both** the approval-request "Historial" tab **and** the confirmed replenishment-view details — one reusable timeline (07 §2). *(distinct from `/events`, the SSE status stream)* |
| `PATCH /replenishments/imports/:id` | owner/admin/office | Approval-stage prep (`ready`/`rejected` only): `{ evidencePhotos?, notes? }` — staged on the import so office can fully prepare and an admin approves later. Emits `evidence_updated` / `notes_updated` per changed field |
| `POST /replenishments/imports/:id/reject` | **owner/admin only** (approval decision — office 403, §2.1e) | **Send a `ready` import back to office with feedback** (owner 2026-07-20): body `{ comment }` **required** (`400` if blank); `ready` only (`409 import_not_ready`). Sets status **`rejected`**, emits a **`rejected`** event (the comment in `reason` + actor). Staging rows are untouched — office adjusts them, then resubmits. In-app-notifies office (07 §2) |
| `POST /replenishments/imports/:id/resubmit` | owner/admin/office | **Re-request approval** after adjusting a `rejected` import (owner 2026-07-20): `rejected` only (`409 import_not_rejected`); no body. Sets status back to **`ready`**, emits a **`resubmitted`** event (actor), and **re-fires the manager approval notification** (entering `ready` → banner + in-app notification, §6 / 11 §2). Office's headline follow-up to a rejection |
| `POST /replenishments/imports/:id/discard` | owner/admin/office | Flips any pre-approval status (incl. `rejected`) to **`stale`** — the benign abandon (emits `stale`); its staged rows + any leftover binary are swept by the daily retention cron (11 §4). Used by re-upload to supersede the prior import. *No reason, cron-cleaned, any prep role — distinct from cancel* |
| `POST /replenishments/imports/:id/cancel` | **owner only** (not admin/office — owner 2026-07-20) | **Full cancel** of a pre-approval import: body `{ reason }` **required** (`400` if blank); valid from any pre-approval status (`409 import_not_cancellable` on a terminal one). One transaction — **truncates the staging rows**, purges any leftover binary, sets status **`cancelled`** (record closed), emits a **`cancelled`** event (reason + actor). Immediate + reasoned + owner-gated, unlike discard. A **confirmed** replenishment can't be cancelled (permanent doc — correct via readjustment) |
| `POST /replenishments` | **owner/admin** (approval — office excluded, §2.1e) | `{ importId }` — **the approval: promotes the staging table into the inventory tables.** Import must be `ready` (`409 import_not_ready`) with zero **fixable** row errors (`409 import_has_errors` — unprocessable rows don't block, owner 2026-07-20). One transaction: increment `wms_counters` folio → insert doc + items from **all** staged rows — serial-collision rows become **`unprocessable: true` items carrying their error code: recorded and visible in the document, but no movement, no units, no stock effect** (awareness for record review / provider follow-up) → per processable item, emit an inbound movement (`reason: replenishment`, `replenishmentId` set) through the same 01 §3 path (serialized: creates units) → **delete the staged rows and mark the import `confirmed`** (true move — owner 2026-07-19, the sanctioned staging exception; the import header row stays as the trail: file name, mapping, submission snapshot, event log) → **emit `approved`** (`{ folio, replenishmentId }`). Append-only applies to the *doc*: no PATCH/DELETE routes on replenishments |

**Processing (owner decision 2026-07-19 — Cloudflare Queues; supersedes the
external-service iterations):** the batch job runs in the backend's **own Queues
consumer** (`11-processing-service.md`), same Worker deploy. The request path never
parses more than header + sample rows; the consumer (raised `limits.cpu_ms`,
platform retries + DLQ, native R2/DB bindings) does the full parse and is the only
writer of `processing → ready/failed`. The contract stays **202 + DB-backed status
(SSE stream / one-shot GET)**, so processing could still be extracted to an
external service later without touching the API or superadmin — the consumer never
knows SSE exists.

**Approval/failure notification (owner 2026-07-20):** **entering `ready`** — from
processing OR a **resubmit after rejection** — (awaiting approval), or `failed`,
warns the configured **CMS-manager** (`notifications.manager_user_id` — §1, 01 §2):
an **in-app notification** + the superadmin app-shell **banner** (07 §2/§3; the de-branded **email** channel is deferred — owner 2026-07-21, v1 in-app only). The notifier
is one helper, fired wherever a row enters `ready` (the queue consumer on processed,
the `resubmit` endpoint on re-request — 11 §2), so it is a request-path call there,
not only a consumer side-effect. **Rejection notifies the other direction:** office
is told its import was returned — in-app (the list flags `rejected` as "cambios
solicitados" and routes to adjust, 07 §2); an office email is a deferred symmetric
option. Best-effort — an unconfigured recipient is skipped; the banner reuses
`pendingImports`. Resolves the deferred "notify admins of pending approvals" item.

## 7. Report materials — `report-materials.controller.ts` (mounted at `/reports`)

| Endpoint | Roles | Notes |
|---|---|---|
| `GET /reports/:id/materials` | owner/admin/office + technician (own report — `403 not_own_report`) | Rows: material (name/sku/unit/tracking), quantity \| unit serial, sourceWarehouse |
| `PUT /reports/:id/materials` | owner/admin + technician (own report) — **office excluded** (read-only per §2.1b) | `{ items: [{ materialId, quantity? \| materialUnitId? \| (lotNumber + quantity), sourceWarehouseId }] }` — replace-set semantics; lot consumption draws from that lot's balance at the source (added 2026-07-20). Backend **diffs current vs incoming** and emits movements (08 §3): additions → `consumption` (reason `report_binding`, `reportId` set); removals/decreases → compensating `readjustment` in; increases → additional consumption. **Technician constraints, server-enforced:** own report only, report still editable (`created`/`in-progress` — `409 report_not_editable`), every `sourceWarehouseId` = their own van (`403 source_forbidden`). Owner/admin: any report, any source, any status (corrections) |

## 8. Uploads

Evidence photos ride the existing upload module (multi-image, R2 keys committed with the
replenishment) — **target bucket: dedicated `manttio-wms-evidence`** (permanent evidence
photos; the `manttio-equipment` precedent; own CDN base via env/secret like
`EQUIPMENT_CDN_BASE_URL`). Import source files land in a **separate transient bucket
`manttio-wms-sheets`** — purged once processed (01 §4). (owner 2026-07-20 — SUPERSEDES
the single `manttio-wms` bucket split by `imports/`+`evidence/` prefixes: source-sheets
and evidence now live in dedicated buckets.) Detail + asks: `07-replenishments.md` §4.

## 9. Error-code index (module-wide)

`invalid_parent` · `invalid_parent_type` · `duplicate_node_name` · `node_not_empty` ·
`warehouse_not_empty` · `not_a_technician` · `technician_already_assigned` ·
`sku_in_use` · `upc_in_use` · `tracking_immutable` · `material_has_stock` · `tracking_mismatch` ·
`node_warehouse_mismatch` · `invalid_reason_context` · `reason_inactive` ·
`builtin_locked` · `use_replenishment_flow` (non-admin only) · `insufficient_stock` · `serial_exists` ·
`unit_not_available` · `not_own_van` · `no_assigned_warehouse` · `source_forbidden` ·
`not_own_report` · `report_not_editable` · `unparseable_file` · `invalid_mapping` ·
`import_not_pending` · `import_not_ready` · `import_not_rejected` · `import_not_cancellable` · `import_has_errors` · `import_in_progress` ·
`missing_lot` · `bad_expiry` ·
`count_not_found` · `count_not_open` · `count_empty` (owner 2026-07-21, §6 #29) ·
`invalid_assignment_level` · `incomplete_assignment` · `assignee_not_found` ·
`warehouse_not_locatable` (the four added with the 2026-08-21 assignment/locatability
columns) — each a typed error in `wms/http-errors/`,
mapped in the owning controller (400 validation · 403 role/scope · 404 missing ·
409 conflict).

---

## Checkpoints

### CP-1 — Structure + catalog endpoints
- [x] §2 warehouses/nodes live with role gates + error codes; office read-only verified
      (mutations 403) — 2026-08-21, `modules/wms/{controllers,services,repository,validators,http-errors}`
- [ ] §3 materials live with role gates + error codes
- [x] Vitest coverage for §2 (`test/wms-warehouses.test.ts`; fixtures carry the
      `wms-test-` name prefix and are soft-deleted in `afterAll`)
- [ ] Vitest coverage for §3

**Unpaged by design (2026-08-21):** §1 says every list endpoint is paged, but §2's own
rows never ask for `page`/`limit` while §3/§4/§6 do. Warehouses and storage nodes follow
the services-catalog precedent (18 §4) — tens of rows, every picker wants all of them,
and a truncated self-checkout source list would be wrong. Paging stands for materials
and movements.

### CP-2 — Stock ops + reasons
- [ ] §4 inbound/transfer/readjust + movements query; §5 reasons CRUD-minus-delete;
      seed verified via API
- [ ] Self-checkout constraint tests (destination, source, reason — all three rejected
      paths); append-only grep + 404 on PATCH/DELETE attempts
- [ ] Technician movement scoping test (own van + own reports only)

### CP-3 — Replenishments + report materials
- [ ] §6 import endpoints: upload + field detection (three formats, sample rows,
      `unparseable_file`), process (mapping validation, `queued` transition, 202),
      one-shot status read + SSE stream (change-emit, heartbeat, terminal close),
      staged-row PATCH (re-resolution) + **row DELETE (owner/admin only, reason
      required)** + prep PATCH, discard; **reject (owner/admin, comment required →
      `rejected`) + resubmit (→ `ready`, re-notifies) with `ready`/`rejected`
      editable-state gates + owner-only cancel (required reason → `cancelled`, staging
      truncated + binary purged, `import_not_cancellable` guard)**; **`GET .../audit`**;
      `settings` module +
      last-mapping upsert/suggest;
      **approval** (owner/admin only — office 403; promotion transaction from
      staging: folio, items, evidence/notes copy, movements, `confirmed` flip,
      `import_has_errors` gate).
- [ ] **Whole-lifecycle audit** (`replenishment_import_events`): every endpoint emits
      its event (`created`…`approved`); office row-DELETE 403s; the log is
      append-only and **survives approval** (staged rows gone, events + snapshot
      stay) — tested end-to-end. Full-file parse/row-error tests live in 11 CP-2
      (the queue-consumer suite — same repo); this checkpoint's tests stop at
      `queued` + the enqueue call
- [ ] §7 GET/PUT with diff-to-movements; technician + office constraint tests;
      compensation emission test (remove/decrease/increase paths)
- [ ] Backend plan §3 wms bullet updated to point here (same commit)

## Open decisions / asks
- `office` role backend prerequisite (§ header) — sequence with the users-module slice.
- ~~SheetJS CPU check~~ — **retired 2026-07-19**: full-file parsing runs in the
  Queues consumer with a raised `limits.cpu_ms` (11 §1); the request path only
  sniffs headers + ≤5 sample rows.
- Bucket ask (§8) — provision `manttio-wms-sheets` + `manttio-wms-evidence` + CDN base
  envs before CP-3 (native bindings — **no S3 credentials needed**). New ops asks: Workers **paid plan** +
  per-tenant queue/DLQ provisioning (11 §1).
- Movements list: should office see readjustment notes? (§2.1 gives office full stock +
  movement visibility — spec: yes, visibility ≠ execution.) Confirm.
- SSE watcher granularity: v1 the stream handler re-reads the row every ~2 s;
  move to Postgres `LISTEN/NOTIFY` only if watcher load ever matters (the queue
  consumer is unaffected either way).
