# 10-wms / 02 — API surface (backend)

> **Status:** not-started · **Depends on:** 01
> **Owner:** — · **Last updated:** 2026-07-19

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
              enqueue, status reads — the backend NEVER parses full files: the
              parse+validate batch job belongs to the standalone **processing
              service**, its own project — `11-processing-service.md`)
repository/   one per aggregate; movements repo insert+select only (01 CP-2)
models/ · validators/ · enums/ · constants/ (STORAGE_NODE_RANK, seed reasons,
              import-template columns) · types/ · http-errors/ (typed domain errors →
              controller maps to status)
```

All routes sit behind the JWT middleware (no public WMS surface). Every list endpoint
is paged (`page`/`limit`, default 25, max 100) returning `{ items, total }`.

## 2. Warehouses + storage nodes — `warehouses.controller.ts`

| Endpoint | Roles | Notes |
|---|---|---|
| `GET /warehouses` | owner/admin/office/technician | Flat, `?parentId=` filter. Technician calls it for self-checkout source lists — service **excludes other technicians' warehouses** for them (a) |
| `GET /warehouses/tree` | owner/admin/office | Roots with nested subs + `assignedTechnician { id, name }` + per-warehouse stock summary `{ materialCount, unitCount }` — feeds the list page |
| `GET /warehouses/:id` | owner/admin/office + assigned technician (own van — 09) | Detail incl. derived `type` |
| `POST /warehouses` | owner/admin | `{ name, parentId?, address?, notes? }` — parent must be a root (`400 invalid_parent`) |
| `PATCH /warehouses/:id` | owner/admin | Same fields; re-parenting allowed while empty only |
| `DELETE /warehouses/:id` | owner/admin | Soft; empty-only (`409 warehouse_not_empty`); cascades soft-delete to its nodes |
| `POST /warehouses/:id/assign-technician` | owner/admin | `{ userId: uuid \| null }` — null unassigns. FK-validates the user is a technician (`400 not_a_technician`); partial unique → `409 technician_already_assigned` |
| `GET /warehouses/:id/nodes?parentNodeId=` | owner/admin/office + assigned technician | Lazy children (roots when param absent) with `hasChildren` |
| `POST /warehouses/:id/nodes` | owner/admin | `{ parentNodeId?, type, name }` — rank rule (`400 invalid_parent_type`), name unique in parent (`409 duplicate_node_name`) |
| `PATCH /warehouses/:id/nodes/:nodeId` | owner/admin | `{ name }` only — type immutable, no move in v1 |
| `DELETE /warehouses/:id/nodes/:nodeId` | owner/admin | Soft; empty-only (`409 node_not_empty`) |
| `GET /warehouses/:id/stock?nodeId=` | owner/admin/office + assigned technician | Stock at the location: unserialized `{ material, quantity }[]` + serialized units in `in_stock` |

## 3. Materials — `materials.controller.ts`

| Endpoint | Roles | Notes |
|---|---|---|
| `GET /materials?search&tracking&lowStock&page&limit` | owner/admin/office/technician | Paged; `search` matches **name, sku, and upc** (exact-ish on the codes, ilike on name — a keyboard-wedge barcode scan into any search box resolves the material). Rows carry `totalStock` + `lowStock` (`totalStock < minStock`). Technician read = stock lookup (09) — same endpoint, no special casing |
| `GET /materials/:id` | owner/admin/office/technician | Detail |
| `GET /materials/:id/stock` | owner/admin/office/technician | Per-location breakdown `{ warehouse, node?, quantity }[]`; serialized adds the unit list `{ id, serialNumber, warehouse, node?, status }[]` |
| `POST /materials` | owner/admin | `{ sku?, upc?, name, description?, unit, tracking, minStock? }` (`409 sku_in_use` / `409 upc_in_use`; upc validated `^\d{8,14}$`) |
| `PATCH /materials/:id` | owner/admin | `tracking` rejected once movements exist (`409 tracking_immutable`) |
| `DELETE /materials/:id` | owner/admin | Soft; zero stock everywhere (`409 material_has_stock`) |

## 4. Stock operations + movements — `stock.controller.ts`

All three ops take a **required `reason`** validated against the def's `applies_to` +
`active` (`400 invalid_reason_context` / `400 reason_inactive`), and exactly one of
`quantity` (unserialized) / serial payload (serialized) matching the material's tracking
(`400 tracking_mismatch`). Location payloads are `{ warehouseId, storageNodeId? }`; the
node must belong to the warehouse (`400 node_warehouse_mismatch`). Everything runs the
01 §3 transaction.

| Endpoint | Roles | Body |
|---|---|---|
| `POST /stock/inbound` | owner/admin/office | `{ materialId, to, quantity? \| serials?: string[], reason, notes? }` — serialized inbound **creates the `material_units` rows** (`409 serial_exists`). Reason `replenishment` rejected here: `400 use_replenishment_flow` (proposed 2026-07-19 — bulk restock is a document, 07) |
| `POST /stock/transfer` | owner/admin/office/**technician** | `{ materialId, from, to, quantity? \| materialUnitIds?: uuid[], reason, notes? }` — units must be `in_stock` at `from` (`409 unit_not_available`). **Technician = self-checkout, server-enforced:** `to` must be their assigned warehouse (`403 not_own_van`; none assigned → `409 no_assigned_warehouse`), `from` must not be another technician's warehouse (`403 source_forbidden`), reason forced `relocation` (`400 invalid_reason_context`) |
| `POST /stock/readjust` | owner/admin | `{ direction, materialId, at, quantity? \| materialUnitIds?, reason, notes }` — **notes required** (validator). Out on serialized flips units to `lost` when reason ∈ `damaged_material`/`stock_cleaning`/`doa` (else they leave stock as plain out); in restores/creates per reason. This is the only correction instrument |
| `GET /movements?materialId&warehouseId&nodeId&reportId&replenishmentId&type&reason&from&to&page&limit` | owner/admin/office/technician | Paged, newest first; `warehouseId` matches either side. Rows: type, direction?, reason `{ code, label }`, material, quantity/units, from/to (warehouse+node names), user, report/replenishment links, notes, createdAt. **Technician scope (server-side):** only movements touching their own van or their own reports |

**No `PATCH`/`DELETE` route exists under `/stock` or `/movements` — do not add one.**

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
parses/validates into the **staging table** → frontend **polls the DB-backed status**
until `ready` → prep (row fixes, evidence, notes — staged) → **approval promotes
staging into the inventory tables**. Status truth lives in `replenishment_imports`
(01 §2) — the polling endpoint is a plain DB read, so the processor can run anywhere.
**Prep is owner/admin/office; approval is owner/admin only**
(`../14-access-control.md` §2.1e — the billing draft-vs-commit split).

| Endpoint | Roles | Notes |
|---|---|---|
| `GET /replenishments?warehouseId&from&to&page&limit` | owner/admin/office | Paged: folio, warehouse, itemCount, evidenceCount, user, createdAt |
| `GET /replenishments/:id` | owner/admin/office | Doc + items (joined material name/sku/tracking) + evidence keys + source-file **name** via the `import_id` join (metadata only — the binary is purged post-processing, 01 §4; the import rows' `raw` are the durable record) |
| `POST /replenishments/imports` | owner/admin/office | Multipart `{ file }` (`.xlsx`/`.csv`/`.txt`, delimiter-sniffed; size cap 1 MB). Stages the file in R2 **first** (the reference the processor pulls it by; transient — purged after processing, 01 §4), then does **lightweight field detection only** (header row + ≤5 sample values per column — cheap even via SheetJS) → creates the import row (`status: uploaded`) → `{ importId, fileName, fields: [{ id, header, samples }] }`. Unreadable file → `400 unparseable_file`, no row created |
| `POST /replenishments/imports/:id/process` | owner/admin/office | `{ warehouseId, mapping: { sku: fieldId, quantity?: fieldId, serial?: fieldId } }` — `sku` required, plus at least one of `quantity`/`serial` (`400 invalid_mapping`); only from `uploaded` (`409 import_not_pending`). Stores mapping + warehouse, sets **`queued`** → **`202 { status }`**. The **processing service** (11) claims the job, walks the file per the mapping, resolves materials (SKU exact, then UPC exact), upserts `replenishment_import_rows` + progress counters, flips `ready`/`failed`. Row errors: `unknown_sku`, `bad_quantity`, `missing_serial`, `duplicate_serial` (in-file), `serial_exists` (in DB), `quantity_on_serialized` (≠1) |
| `GET /replenishments/imports/:id` | owner/admin/office | **The polling endpoint** — `{ id, status, fileName, fields, mapping?, progress: { total?, processed, errors }, error?, evidencePhotos, notes?, rows? }`; `rows` included once `ready` (files are small stock lists — no row paging v1). Pure DB read, cheap to poll |
| `PATCH /replenishments/imports/:id/rows/:line` | owner/admin/office | Inline fix on a **staged row** (`ready` only — `409 import_not_ready`): `{ code?, quantity?, serial?, storageNodeId? }` — server re-resolves (SKU-then-UPC) + re-validates the row and returns it (fixes persist in the temp table, survive reloads/sessions). Frozen once approved |
| `PATCH /replenishments/imports/:id` | owner/admin/office | Approval-stage prep (`ready` only): `{ evidencePhotos?, notes? }` — staged on the import so office can fully prepare and an admin approves later |
| `POST /replenishments/imports/:id/discard` | owner/admin/office | Flips any pre-approval status to `discarded` (rows kept — nothing is ever deleted) |
| `POST /replenishments` | **owner/admin** (approval — office excluded, §2.1e) | `{ importId }` — **the approval: promotes the staging table into the inventory tables.** Import must be `ready` (`409 import_not_ready`) with zero row errors (`409 import_has_errors`). One transaction: increment `wms_counters` folio → insert doc + items **from the staged rows** (evidence/notes copied from the import) → per item, emit an inbound movement (`reason: replenishment`, `replenishmentId` set) through the same 01 §3 path (serialized: creates units) → mark the import `confirmed` (staging frozen). Append-only: no PATCH/DELETE routes on the doc |

**Processing service (owner decision 2026-07-19 — its own project, own repository):**
the batch job runs in the standalone processing service (`11-processing-service.md`
— the cross-repo contract file), deployed on its own server from its own repo. The backend's role stops at storing the file,
detecting fields, and setting `queued`; the service claims jobs straight off the DB
(SKIP LOCKED lease — 01 §2), reads the file from R2, and writes rows + status back to
Neon. The contract is **202 + DB-status polling**, so the backend and frontend are
indifferent to where the service runs. Nothing except the service may write
`processing → ready/failed`. This also retires the SheetJS-on-Workers CPU concern —
the Worker never parses more than the header + sample rows.

## 7. Report materials — `report-materials.controller.ts` (mounted at `/reports`)

| Endpoint | Roles | Notes |
|---|---|---|
| `GET /reports/:id/materials` | owner/admin/office + technician (own report — `403 not_own_report`) | Rows: material (name/sku/unit/tracking), quantity \| unit serial, sourceWarehouse |
| `PUT /reports/:id/materials` | owner/admin + technician (own report) — **office excluded** (read-only per §2.1b) | `{ items: [{ materialId, quantity? \| materialUnitId?, sourceWarehouseId }] }` — replace-set semantics. Backend **diffs current vs incoming** and emits movements (08 §3): additions → `consumption` (reason `report_binding`, `reportId` set); removals/decreases → compensating `readjustment` in; increases → additional consumption. **Technician constraints, server-enforced:** own report only, report still editable (`created`/`in-progress` — `409 report_not_editable`), every `sourceWarehouseId` = their own van (`403 source_forbidden`). Owner/admin: any report, any source, any status (corrections) |

## 8. Uploads

Evidence photos ride the existing upload module (multi-image, R2 keys committed with the
replenishment) — **target bucket: dedicated `manttio-wms`** (proposed 2026-07-19, the
`manttio-equipment` precedent; own CDN base via env/secret like
`EQUIPMENT_CDN_BASE_URL`). Import source files land in the same bucket under
`imports/` — **transient**: purged once processed (01 §4); evidence photos under
`evidence/` are permanent. Detail + asks: `07-replenishments.md` §4.

## 9. Error-code index (module-wide)

`invalid_parent` · `invalid_parent_type` · `duplicate_node_name` · `node_not_empty` ·
`warehouse_not_empty` · `not_a_technician` · `technician_already_assigned` ·
`sku_in_use` · `upc_in_use` · `tracking_immutable` · `material_has_stock` · `tracking_mismatch` ·
`node_warehouse_mismatch` · `invalid_reason_context` · `reason_inactive` ·
`builtin_locked` · `use_replenishment_flow` · `insufficient_stock` · `serial_exists` ·
`unit_not_available` · `not_own_van` · `no_assigned_warehouse` · `source_forbidden` ·
`not_own_report` · `report_not_editable` · `unparseable_file` · `invalid_mapping` ·
`import_not_pending` · `import_not_ready` · `import_has_errors` — each a typed error
in `wms/http-errors/`,
mapped in the owning controller (400 validation · 403 role/scope · 404 missing ·
409 conflict).

---

## Checkpoints

### CP-1 — Structure + catalog endpoints
- [ ] §2 warehouses/nodes + §3 materials live with role gates + error codes; office
      read-only verified (mutations 403)
- [ ] Vitest coverage per resource (fixture pattern per `backend/CLAUDE.md` Testing —
      WMS fixtures cleaned by a `wms-test-` name prefix)

### CP-2 — Stock ops + reasons
- [ ] §4 inbound/transfer/readjust + movements query; §5 reasons CRUD-minus-delete;
      seed verified via API
- [ ] Self-checkout constraint tests (destination, source, reason — all three rejected
      paths); append-only grep + 404 on PATCH/DELETE attempts
- [ ] Technician movement scoping test (own van + own reports only)

### CP-3 — Replenishments + report materials
- [ ] §6 import endpoints: upload + field detection (three formats, sample rows,
      `unparseable_file`), process (mapping validation, `queued` transition, 202),
      polling read, staged-row PATCH (re-resolution) + prep PATCH, discard;
      **approval** (owner/admin only — office 403; promotion transaction from
      staging: folio, items, evidence/notes copy, movements, `confirmed` flip,
      `import_has_errors` gate). Full-file parse/row-error tests live in the
      processing service's suite (11 CP-2) — backend tests stop at `queued`
- [ ] §7 GET/PUT with diff-to-movements; technician + office constraint tests;
      compensation emission test (remove/decrease/increase paths)
- [ ] Backend plan §3 wms bullet updated to point here (same commit)

## Open decisions / asks
- `office` role backend prerequisite (§ header) — sequence with the users-module slice.
- ~~SheetJS CPU check~~ — **retired 2026-07-19**: full-file parsing moved to the
  processing service (11); the Worker only sniffs headers + ≤5 sample rows.
- Bucket ask (§8) — provision `manttio-wms` + CDN base env before CP-3; the
  processing service additionally needs **R2 S3-compatible read credentials** (11 §4).
- Movements list: should office see readjustment notes? (§2.1 gives office full stock +
  movement visibility — spec: yes, visibility ≠ execution.) Confirm.
