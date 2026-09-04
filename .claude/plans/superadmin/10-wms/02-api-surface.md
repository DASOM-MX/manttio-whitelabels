# 10-wms / 02 — API surface (backend)

> **Status:** in-progress — **CP-1 complete** (§2 warehouses + storage nodes
> 2026-08-21, §3 materials 2026-08-22), **CP-2 complete** (§4 stock ops +
> `GET /movements`, §5 reasons, the settings store — 2026-08-22), **CP-3 in
> progress**: the §6 import LIFECYCLE landed 2026-08-24 (upload → map → queue
> hand-off → review → decision + the audit log). Still open in CP-3 — the SSE
> stream, the queue consumer (11), the approval promotion, and §7 report
> materials · **Depends on:** 01
> **Owner:** — · **Last updated:** 2026-08-24
>
> ⚠️ **The §6 endpoints cannot be DEPLOYED until three things are provisioned**
> (§8 + 11 §1, asks that predate this build): the `manttio-wms-sheets` and
> `manttio-wms-evidence` R2 buckets, the `manttio-wms-imports` queue + its DLQ,
> and the Workers **paid** plan that Queues requires. The bindings are declared
> in `wrangler.toml`, so miniflare simulates them and the suite is green — but
> `wrangler deploy` fails against an account that lacks them.

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

**Config store — `wms/models/wms-settings.model.ts` + `services/wms-settings.service.ts`**
(added 2026-07-19; **scoped WMS-local 2026-08-08**, built 2026-08-22): a per-tenant
**Postgres `wms_settings` key-value table** (01 §2: `id · key · value` jsonb;
**new settings = new rows under a new key in `constants/wms-setting-keys.ts`, never new
columns**) exposed as `getSetting(db, key, fallback)` / `setSetting(db, key, value)`,
keys namespaced `<domain>.<name>`. An absent row **behaves exactly like its default**
(`WMS_SETTING_DEFAULTS`, read through the named accessors `getStockCountBlind` /
`getReservationAutoReturnDays`) — provisioning seeds nothing, so "never written" and
"written to the default" are indistinguishable to every reader. **No
controller in v1** — it's backend-internal; a settings API lands only when a user-facing
setting appears.

~~a per-tenant **Durable Object fronts it as a read cache**~~ (owner 2026-07-21) —
**dropped 2026-08-08** along with the cross-cutting `modules/settings/` home: Postgres is
the source of truth and these reads are neither hot nor frequent. Add a cache only if
they ever become so.

Keys, in the order they land: `wms.last_replenishment_mapping` (§6 — the mapper-prefill
memory), `wms.stock_count_blind` (§4 counts, default `true`), `wms.reservation_auto_return_days`
(00 §6 #10, default 3). **`notifications.manager_user_id` no longer lives here** — the
2026-08-08 scope-down made this store WMS-local, so the configured **CMS-manager** who
receives replenishment approval/failure warnings (owner 2026-07-20; 01 §2, §6, 11 §2)
**needs a home of its own** (likely the notifications module) before 07/11 build those
warnings. Provisioned at tenant setup either way — an in-tenant editor is a later add.

## 2. Warehouses + storage nodes — `warehouses.controller.ts`

**Response shape (2026-09-03, `backend/CLAUDE.md` 21 CP-1).** The three unpaged
reads here — `GET /warehouses`, `GET /warehouses/tree`, `GET /warehouses/:id/nodes`
— answer with a **bare array**, not an `{ items }` or `{ warehouses }` wrapper.
They are roster reads: no page, no limit, and a `total` could only restate the
array's own length, so the wrapper carries no information. `GET /customers/all`
and `GET /services/all` set the precedent. `GET /warehouses/:id/stock` keeps its
`{ entries, units, lots }` object — that is three distinct lists in one
response, not a list wrapper. Paged reads elsewhere in this module (§3 materials,
§4 movements, §6 replenishments) use `GenericQueryResponse<T>`
(`{ items, total, page, limit }`) instead.


| Endpoint | Roles | Notes |
|---|---|---|
| `GET /warehouses` | owner/admin/office/technician | Flat, `?parentId=` filter. Technician calls it for self-checkout source lists — service **excludes other technicians' warehouses** for them (a) |
| `GET /warehouses/tree` | owner/admin/office | Roots with nested subs + `assignedUser { id, name, role }` + per-warehouse `stockSummary { materialCount, unitCount }` — feeds the list page. **`assignedUser` supersedes `assignedTechnician`** (user 2026-08-21): the column became `assigned_user_id` + `assignment_role`, so the badge carries WHAT the person is to the location. `materialCount` counts distinct materials across the three tracking modes (a material has exactly one, so the three counts sum exactly); `unitCount` is total on-hand amount, mixed UoM summed — a "how loaded is this place" badge, not a valuation |
| `GET /warehouses/:id` | owner/admin/office + assigned technician (own van — 09) | Detail incl. derived `type` |
| `POST /warehouses` | owner/admin | `{ name, parentId?, address?, notes? }` — parent must be a root (`400 invalid_parent`) |
| `PATCH /warehouses/:id` | owner/admin | Same fields; re-parenting allowed while empty only. `null` CLEARS a field, `undefined` leaves it — so **the coordinate pair moves together in both directions**: dropping the pin is `{ latitude: null, longitude: null }`, and clearing one side alone is a `400` (it would violate `warehouses_coords_pair_check`). Locatability is judged on the MERGED row, so a PATCH that erases the last locator answers `400 warehouse_not_locatable` |
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
| `GET /materials?search&tracking&lowStock&page&limit` | owner/admin/office/technician | Paged; `search` matches **name anywhere (ilike), `sku` by prefix, `upc` exactly** (2026-08-22 — a keyboard-wedge scan types the full barcode and hits Enter, so exact `upc` is what makes the plain box a scan target; a partial barcode is a mis-scan and deliberately does not match). Rows carry `totalStock` + `lowStock` (`totalStock < minStock`; false whenever `minStock` is unset). **Both are computed in SQL**, not folded in memory — the list filters and pages on them, and a total assembled after paging would page wrongly |
| `GET /materials/:id` | owner/admin/office/technician | Detail |
| `GET /materials/:id/stock` | owner/admin/office/technician | Per-location breakdown `{ warehouse, node?, quantity }[]`; serialized adds the unit list `{ id, serialNumber, warehouse, node?, status }[]`; **lot adds the lot list** `{ lotNumber, warehouse, node?, quantity, `**`pieces`**`, expiresAt? }[]` (added 2026-07-20; `pieces` added 2026-08-22 with the column, user 2026-08-08; `expiresAt` present only for tracked lots). All three keys are **always present** so the client renders from the tracking mode, not from which list happens to be non-empty. Units are listed in **every** status here (unlike `GET /warehouses/:id/stock`, which is on-hand only): this is the "where did that serial end up?" surface |
| `POST /materials` | owner/admin | `{ sku?, upc?, name, description?, unit, tracking, minStock? }` (`409 sku_in_use` / `409 upc_in_use`; upc validated `^\d{8,14}$`) |
| `PATCH /materials/:id` | owner/admin | `tracking` rejected once **movements** exist (`409 tracking_immutable`) — history freezes the mode, not stock: a material drained back to zero still has a journal that assumes its mode. Re-stating the SAME mode is not a change and never trips the guard. Nullable fields clear on `null`; a body that changes nothing is a **no-op 200**, never a 500 |
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

**Built 2026-08-22 — the shipped surface, beyond what the table below already said:**

- **`pieces` rides every lot body** (user 2026-08-08, optional, default 0): `quantity` is
  the content, `pieces` the physical packages, and both move together. A source is
  refused on *either* dimension — 200 nails may leave an open bag with no bag leaving,
  but three bags cannot leave a shelf holding two (`409 insufficient_stock` names which).
- **Lot expiry is a property of the LOT, not of the receipt.** Whatever `expires_at` is
  already stored for a `(material, lotNumber)` wins over an `expiresAt` in the body — on
  top-up *and* at a fresh location — and a transfer copies the source row's date to the
  destination. A split lot never disagrees with itself about when it expires.
- **`Idempotency-Key` header** (optional, ≤200 chars, 00 §6 #21) on all three write
  endpoints: a replay returns the ORIGINAL movement, same `201`, same body — a retrying
  offline client should not have to branch on whether its first attempt got through.
  Over-long → `400 invalid_idempotency_key`. Without a key there is no replay protection;
  the same request twice books twice, by design.
- **`400 same_location`** — a transfer whose source and destination are the same location
  is refused rather than journaled: the balances would net to zero and the journal would
  gain a row describing nothing having moved.
- **Readjust-in accepts `serials`** (creating pieces that exist physically but were never
  received) as well as `materialUnitIds` (restoring pieces that left). Restoring a unit
  that is *already* in stock is `409 unit_not_available` — that would journal an increase
  that never happened, and moving a live piece is what `transfer` is for. `serials` on a
  readjust-**out** is a `400`.
- **Scope is judged before shape.** A technician's transfer answers the self-checkout
  constraints before any body-semantics error, so a malformed body never doubles as a
  probe of which warehouses exist.
- **A serialized out that is not a write-off leaves the unit `consumed`**, not `lost`:
  both are out of stock, but "scrapped" and "handed to the client" are not the same
  event and the write-off reason list is what tells them apart.

| Endpoint | Roles | Body |
|---|---|---|
| `POST /stock/inbound` | owner/admin/office | `{ materialId, to, quantity? \| serials?: string[] \| (lotNumber + quantity), reason, notes? }` — serialized inbound **creates the `material_units` rows** (`409 serial_exists`); lot inbound creates/tops-up the lot at `to`. Reason `replenishment` is **admin-selectable here** (owner 2026-07-20 — occasional ad-hoc replenishments, each its own append-only trail entry); **non-admins (office) still get `400 use_replenishment_flow`** — bulk restock stays a document (07). SUPERSEDES the blanket reject (proposed 2026-07-19) |
| `POST /stock/transfer` | owner/admin/office/**technician** | `{ materialId, from, to, quantity? \| materialUnitIds?: uuid[] \| (lotNumber + quantity), reason, notes? }` — units must be `in_stock` at `from` (`409 unit_not_available`); lot transfers draw from that lot's balance at `from`. **Technician = self-checkout, server-enforced:** `to` must be their assigned warehouse (`403 not_own_van`; none assigned → `409 no_assigned_warehouse`), `from` must not be another technician's warehouse (`403 source_forbidden`), reason forced `relocation` (`400 invalid_reason_context`) |
| `POST /stock/readjust` | owner/admin | `{ direction, materialId, at, quantity? \| materialUnitIds? \| serials? (in only) \| (lotNumber + quantity + pieces?), reason, notes }` — **notes required** (validator). Out on serialized flips units to `lost` when reason ∈ `damaged_material`/`stock_cleaning`/`doa`/`scrap` (else they leave stock as plain out); in restores/creates per reason. This is the only correction instrument |
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

**Built 2026-08-22.** The slug folds accents and collapses everything non-alphanumeric to
`_`, so a custom code reads like the snake_case built-ins; collisions take a `-2`, `-3`
suffix (01 §2) and the insert retries on the unique index, because two admins adding the
same label at the same moment both read the same free code. Custom reasons are always
created `requiresNote: false` — the two reasons that force a note are built-ins
(00 §6 #23) and making it configurable was not asked for. The list is deliberately
unpaged and unfiltered: 14 built-ins plus whatever a tenant adds is a select's worth of
rows, and history needs the inactive ones to render its labels.

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

**Built 2026-08-24 — the shipped lifecycle, and what it does not yet do:**

- **Shipped:** upload + field detection, `/process` (mapping validation,
  submission snapshot, last-mapping memory, queue send, `202 queued`), the
  one-shot status read, staged-row `PATCH`/`DELETE`, prep `PATCH`,
  `reject`/`resubmit`/`discard`/`cancel`, and `GET .../audit`. Every mutating
  path emits its event **in the same transaction as the change** — a state
  change that could commit without its event is not an audit trail.
- **Not yet:** the SSE stream (`/events`), the queue consumer that stages the
  rows (11), and the approval (`POST /replenishments`) with its list/detail
  reads. Until the consumer lands, an import reaches `queued` and stops there.
- **File formats.** `.csv`/`.txt` are delimiter-sniffed (tab, then semicolon,
  then comma; the first that splits the header into more than one column wins)
  with RFC-4180 quoting; `.xlsx` goes through SheetJS. Both live behind ONE
  `readRows` helper that upload-time detection and the queue consumer share, so
  a file is never interpreted two ways. *(The lifecycle slice shipped
  csv/txt-only and refused `.xlsx`; the processing slice added it 2026-08-24
  along with the full-file walk, deliberately together so the format got one
  implementation rather than two.)* Ghost trailing columns — a header cell that
  was typed and cleared — are dropped; an empty header BETWEEN two real ones is
  still refused, because it can neither be mapped nor key the remembered
  mapping.
- **`400 file_too_large`** is its own code, not `unparseable_file`: a 3 MB sheet
  may be perfectly well-formed and simply not belong in this flow.
- **`pieces` is editable on a staged row** alongside the plan's listed fields —
  the column exists (user 2026-08-08) and a reviewer correcting a lot line needs
  it. `expiry` and `pieces` are refused as mapping targets without `lot`: both
  are properties OF a lot and alone they describe nothing.
- **The row PATCH re-runs the parser's own rules** (`helpers/import-rows.helpers.ts`,
  shared with the consumer), so a fix can legitimately reveal the next problem —
  supplying a missing serial surfaces `quantity_on_serialized` if the quantity
  was also wrong. Validation reports **fixable errors before unprocessable
  ones**: a reviewer can act on `quantity_on_serialized`, and being told
  `serial_exists` while the quantity is also wrong hides the half they can fix.
- **`409 import_in_progress` carries the existing `importId`** in the body, so
  the client resumes that import instead of only being told no (07 §2).

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

**Declared 2026-08-24, NOT yet provisioned.** `wrangler.toml` now binds
`MANTTIO_WMS_SHEETS` + `MANTTIO_WMS_EVIDENCE` (dev and production) and sets
`WMS_EVIDENCE_CDN_BASE_URL`; `env.ts` types the evidence CDN base as **optional**
for the same reason `IMAGES_CDN_BASE_URL` is — a tenant deploy without it stores
the key and omits the URL rather than emitting `undefined/<key>`. The buckets
themselves, the `manttio-wms-imports` queue + DLQ, and the paid plan are still
ops asks; miniflare simulates all three locally, so the suite passes without
them and only `wrangler deploy` is blocked.

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
columns) ·
`same_location` · `note_required` · `invalid_idempotency_key` (2026-08-22, with the stock
ops) · `file_too_large` (2026-08-24, with the imports) — each a typed error in `wms/http-errors/`,
mapped in the owning controller (400 validation · 403 role/scope · 404 missing ·
409 conflict).

---

## Checkpoints

### CP-1 — Structure + catalog endpoints
- [x] §2 warehouses/nodes live with role gates + error codes; office read-only verified
      (mutations 403) — 2026-08-21, `modules/wms/{controllers,services,repository,validators,http-errors}`
- [x] §3 materials live with role gates + error codes — 2026-08-22. Catalog writes
      owner/admin; reads open to every role with **no special casing** (the technician
      read IS the stock-lookup surface, 09 §2, and nothing in a material row is
      confidential — there is no `cost` here, unlike the services catalog)
- [x] Vitest coverage for §2 (`test/wms-warehouses.test.ts`) and §3
      (`test/wms-materials.test.ts`). Fixtures carry the `wms-test-` marker with a
      **per-suite** prefix (`wms-test-wh-` / `wms-test-mm-`) and are soft-deleted in
      `afterAll` — vitest runs files in parallel, so a shared prefix had one suite
      cleaning the other's live fixtures mid-run

**Quantity scale (2026-08-22):** every quantity this module returns is `trim_scale`d,
so a whole five reads as `5` rather than the column's `5.000`. v1 quantities are whole
integers (00 §6 #22) and `numeric(12,3)` is an implementation detail; two endpoints
answering the same quantity differently would be worse than either choice.

**Unpaged by design (2026-08-21):** §1 says every list endpoint is paged, but §2's own
rows never ask for `page`/`limit` while §3/§4/§6 do. Warehouses and storage nodes follow
the services-catalog precedent (18 §4) — tens of rows, every picker wants all of them,
and a truncated self-checkout source list would be wrong. Paging stands for materials
and movements.

### CP-2 — Stock ops + reasons — **done 2026-08-22**
- [x] §4 inbound/transfer/readjust + `GET /movements`; §5 reasons CRUD-minus-delete;
      the 14 seeds verified through the API against the TS mirror. Plus the settings
      store (§1) — no controller, backend-internal, defaults bound to their keys
- [x] Self-checkout constraint tests (destination, source, reason — all three rejected
      paths, plus the no-van case); append-only — the movements repository exposes
      insert + select and nothing else (grep-provable), and PATCH/DELETE under `/stock`
      and `/movements` 404
- [x] Technician movement scoping test (own van + own reports only; a colleague's
      technician sees none of it, office sees all of it)
- [x] **01 CP-2 invariants, tested here** because this is the slice that can move stock:
      the signed journal equals the materialized balance across an inbound + transfer +
      both readjust directions; a unit ends where its last movement says; and two
      parallel draws off one balance land exactly one `201` and one
      `409 insufficient_stock`, never a negative balance
- [x] `test/wms-stock.test.ts` — 39 tests, per-suite fixture prefix `wms-test-st-`.
      **The `movements` rows a test writes are permanent**: the journal is append-only,
      so `afterAll` soft-deletes the warehouses and materials and leaves their history
      behind, exactly as production does

### CP-3 — Replenishments + report materials — **lifecycle leg done 2026-08-24**

Landed: upload + field detection (csv/txt at first; **`.xlsx` added 2026-08-24
with the processing slice**), process (mapping validation, `queued`, 202, last-mapping upsert),
one-shot status read, staged-row PATCH + owner/admin row DELETE (reason
required) + prep PATCH, reject (comment required) / resubmit / discard /
owner-only cancel with their state gates, `GET .../audit`, and the settings
key the mapper memory rides on. `test/wms-replenishments.test.ts` — 24 tests,
prefix `wms-test-rp-`; the mapper-memory setting is a per-tenant singleton, so
the suite snapshots and restores it per `backend/CLAUDE.md`.

**The queue consumer landed 2026-08-24** (11 CP-1 + CP-2): an import now runs
`queued → processing → ready/failed` on its own. Still open below: the SSE
stream, the approval promotion, and §7.

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
