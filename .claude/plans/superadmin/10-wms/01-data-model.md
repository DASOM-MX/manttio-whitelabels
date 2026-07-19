# 10-wms / 01 — Data model (backend)

> **Status:** not-started · **Depends on:** — (first WMS slice to build)
> **Owner:** — · **Last updated:** 2026-07-19

Backend-side source of truth for every WMS table, enum, seed, and invariant. Frontend
DTO views live in each feature sub-plan; keep them in sync with this file. Module code
lives in `backend/src/modules/wms/` (layout in `02-api-surface.md` §1); models follow
`backend/CLAUDE.md` — tables in `wms/models/*.model.ts`, every `relations()` in the
`modules/database/schema.ts` barrel, string-valued TS enums in `wms/enums/`, columns
typed with `.$type<TheEnum>()`.

**Migration workflow:** the shared Neon DB is managed ahead of the checked-in migrations
(live DB currently through `0010`) — generate SQL with `pnpm db:generate` for the record,
but **apply additive DDL directly** to the live DB (don't blind-run `db:migrate`); all
WMS DDL is purely additive so this stays safe.

---

## 1. Enums (`wms/enums/`)

```ts
enum StorageNodeType { StorageUnit = 'storage_unit', Rack = 'rack',
                       Section = 'section', StorageBox = 'storage_box' }
enum MaterialTracking { Serialized = 'serialized', Unserialized = 'unserialized' }
enum MaterialUnitStatus { InStock = 'in_stock', Assigned = 'assigned',
                          Consumed = 'consumed', Lost = 'lost' }
enum MovementType { Inbound = 'inbound', Transfer = 'transfer',
                    Consumption = 'consumption', Readjustment = 'readjustment' }
enum ReadjustmentDirection { In = 'in', Out = 'out' }
enum ReasonContext { Inbound = 'inbound', Transfer = 'transfer',
                     ReadjustmentIn = 'readjustment_in',
                     ReadjustmentOut = 'readjustment_out',
                     Consumption = 'consumption' }   // consumption: report_binding only
enum ReplenishmentImportStatus {                     // added 2026-07-19 (owner ask)
  Uploaded = 'uploaded',      // file stored, fields detected, awaiting mapping
  Queued = 'queued',          // mapping submitted, waiting for the processor to claim
  Processing = 'processing',  // claimed by the processing service, job running
  Ready = 'ready',            // rows parsed + validated, preview available
  Failed = 'failed',          // whole-file failure or max attempts (import.error set)
  Confirmed = 'confirmed',    // replenishment created from this import
  Discarded = 'discarded' }   // abandoned by the user — kept, never deleted
```

`STORAGE_NODE_RANK: Record<StorageNodeType, number>` (`wms/constants/`) —
`storage_unit: 1, rack: 2, section: 3, storage_box: 4`; hierarchy rule in §2.

## 2. Tables

All `id` columns `uuid` default random; timestamps `timestamptz`. Quantities are
`numeric(12,3)` — units like `m`/`kg` are fractional; `pza` just uses whole values.

### `warehouses`

| Column | Type / constraint |
|---|---|
| `id` | pk |
| `name` | text, not null |
| `parent_id` | uuid null → `warehouses.id`, `ON DELETE RESTRICT`. **One level of nesting v1**: service rejects a parent that itself has `parent_id` set (`400 invalid_parent`) |
| `assigned_technician_id` | uuid null → `users.id`. **Partial unique index** `WHERE deleted_at IS NULL AND assigned_technician_id IS NOT NULL` — one active warehouse per technician, DB-enforced (`409 technician_already_assigned`) |
| `address`, `notes` | text null |
| `created_at` / `deleted_at` | soft delete |

- `type` (`'warehouse' | 'sub-warehouse'`) is **derived** (`parentId` set ⇒ sub) — never
  stored.
- A **sub-warehouse can be the technician-assigned one** (van as sub of main — assumed
  yes 2026-07-05, still listed for confirm in §6).
- Delete: only when **empty** — no non-deleted child warehouses, no `stock_entries` with
  `quantity > 0`, no `material_units` with status `in_stock`/`assigned` anywhere in it
  (`409 warehouse_not_empty`). Its storage nodes soft-delete in the same transaction.

### `storage_nodes`

| Column | Type / constraint |
|---|---|
| `id` | pk |
| `warehouse_id` | not null → `warehouses.id` |
| `parent_node_id` | uuid null → `storage_nodes.id` |
| `type` | text `.$type<StorageNodeType>()`, not null |
| `name` | text, not null. Unique within parent: `UNIQUE NULLS NOT DISTINCT (warehouse_id, parent_node_id, name)` partial `WHERE deleted_at IS NULL` (`409 duplicate_node_name`) |
| `created_at` / `deleted_at` | **soft delete (proposed 2026-07-19)** — movements reference nodes forever, so rows must outlive the structure |

- **Hierarchy rule:** `STORAGE_NODE_RANK[parent.type] < STORAGE_NODE_RANK[child.type]`,
  levels skippable (box directly in a unit is legal). **Roots may be any type (proposed
  2026-07-19** — a small warehouse that is "just racks" shouldn't need a fake unit;
  confirm §6). Violation → `400 invalid_parent_type`.
- `type` is **immutable** after create; moving a node to another parent is **out of v1**
  (delete-if-empty + recreate; revisit on demand).
- Delete: only when empty — no non-deleted child nodes, no stock, no in-stock units at
  the node (`409 node_not_empty`).

### `materials`

| Column | Type / constraint |
|---|---|
| `id` | pk |
| `sku` | text null; partial unique `WHERE deleted_at IS NULL` (`409 sku_in_use`) — the **internal** code |
| `upc` | text null (**added 2026-07-19, owner ask**) — the scanned barcode: GTIN digits (UPC-A/EAN-8/EAN-13/GTIN-14), validator `^\d{8,14}$`, stored as text (leading zeros matter); partial unique `WHERE deleted_at IS NULL` (`409 upc_in_use`). Resolves searches and replenishment imports alongside `sku` (02 §3/§6) |
| `name` | text, not null |
| `description` | text null |
| `unit` | text, not null — display unit (`'pza'`, `'m'`, `'kg'`, …). Free text ≥1 char; the UI offers the curated suggestion list (10 §4) but doesn't restrict |
| `tracking` | text `.$type<MaterialTracking>()`, not null. **Immutable once the material has any movement** (`409 tracking_immutable`) — UI locks it right after create (05 §3) |
| `min_stock` | numeric(12,3) null — low-stock pill threshold on **total** stock |
| `created_at` / `deleted_at` | soft delete. Delete only at zero stock everywhere (`409 material_has_stock`) |

### `material_units` — serialized only, one row per physical piece

| Column | Type / constraint |
|---|---|
| `id` | pk |
| `material_id` | not null → `materials.id` |
| `serial_number` | text, not null; `UNIQUE (material_id, serial_number)` (`409 serial_exists`) |
| `warehouse_id` | not null → `warehouses.id` — current (or last, once consumed/lost) location |
| `storage_node_id` | uuid null → `storage_nodes.id` |
| `status` | text `.$type<MaterialUnitStatus>()`, not null, default `in_stock` |
| `created_at` | — no `deleted_at`: units are never deleted; `status` is the lifecycle |

Rows are **created by inbound** (ad-hoc or replenishment). `assigned` is **reserved,
unused in v1** (proposed 2026-07-19): consumption flips `in_stock → consumed` directly
on report-material save; a future reserve-on-draft flow can use `assigned` without a
migration.

### `stock_entries` — unserialized balances (materialized)

| Column | Type / constraint |
|---|---|
| `id` | pk |
| `material_id` / `warehouse_id` | not null FKs |
| `storage_node_id` | uuid null |
| `quantity` | numeric(12,3), not null, `CHECK (quantity >= 0)` |
| — | `UNIQUE NULLS NOT DISTINCT (material_id, warehouse_id, storage_node_id)` |

### `movements` — the append-only journal

| Column | Type / constraint |
|---|---|
| `id` | pk |
| `type` | text `.$type<MovementType>()`, not null |
| `direction` | text `.$type<ReadjustmentDirection>()` null — readjustment only (`CHECK ((type = 'readjustment') = (direction IS NOT NULL))`) |
| `reason` | text, not null → **FK to `movement_reason_defs.code`** |
| `material_id` | not null → `materials.id` |
| `quantity` | numeric null — unserialized movements only; serialized movements use `movement_units` |
| `from_warehouse_id` / `from_node_id` | null — set on transfer/consumption/readjustment-out |
| `to_warehouse_id` / `to_node_id` | null — set on inbound/transfer/readjustment-in |
| `report_id` | uuid null → `reports.id` — consumption + report-material compensations |
| `replenishment_id` | uuid null → `replenishments.id` |
| `user_id` | not null → `users.id` — who executed it |
| `notes` | text null — **required (validator-level) when `type = 'readjustment'`** |
| `created_at` | not null |

**No `updated_at`, no `deleted_at`, no UPDATE/DELETE repository function — ever.** The
repository exposes insert + reads only; nothing else may touch the table (master plan §4).

### `movement_units` — serialized movement detail (proposed 2026-07-19)

`(movement_id → movements.id, material_unit_id → material_units.id)`, composite pk.
A join table instead of a `material_unit_ids` array: FK integrity, and "history of this
unit" is a plain indexed join (`material-view` unit drill-down, equipment hook).

### `movement_reason_defs` — tenant-customizable definition entity (master plan §4)

| Column | Type / constraint |
|---|---|
| `id` | pk |
| `code` | text, not null, unique — **immutable**, auto-slugged from the label server-side (collision → `-2` suffix) |
| `label` | text, not null — editable on custom reasons only |
| `built_in` | boolean, not null, default false — the 11 seeds; **fully locked** (no label edits, no deactivation) |
| `applies_to` | text[] of `ReasonContext`, not null, ≥1 |
| `active` | boolean, not null, default true — deactivate instead of delete; **no DELETE path** |
| `created_at` | — |

### `replenishment_imports` + `replenishment_import_rows` — the batch job (added 2026-07-19, owner ask)

File imports are **asynchronous batch jobs with DB-backed status** — the database row
is the single source of truth the frontend polls, which is what lets the processor
move out of the Worker (Queues consumer or an external microservice) later **without
any contract change** (02 §6):

```
replenishment_imports {
  id, status ReplenishmentImportStatus not null default 'uploaded',
  file_key text not null, file_name text not null,   // staged in R2 at upload (07 §4);
                                           //   the key is the reference the processor
                                           //   pulls the file by
  file_deleted_at timestamptz?,            // set when the binary is PURGED (owner
                                           //   2026-07-19 — space): by the processor,
                                           //   once the file is fully processed.
                                           //   key/name stay as the reference; the
                                           //   durable content record is rows.raw
  detected_fields jsonb not null,          // [{ id, header, samples: string[] }] —
                                           //   sniffed at upload for the field mapper
  mapping jsonb?,                          // { sku, quantity?, serial? } → field ids,
                                           //   set when processing starts
  warehouse_id uuid?,                      // destination, set with the mapping
  total_rows int?, processed_rows int not null default 0,
  error_rows int not null default 0,       // progress counters the processor updates
  error text?,                             // whole-file failure detail (status failed)
  locked_at timestamptz?, locked_by text?, // processor claim lease (11 §3): claimed via
                                           //   FOR UPDATE SKIP LOCKED; stale lease
                                           //   (now - locked_at > timeout) is reclaimable
  attempts int not null default 0,         // ++ on each claim; > max (3) ⇒ 'failed'
  user_id not null → users, created_at, updated_at
}                                          // never deleted — abandoned = 'discarded'
replenishment_import_rows {                // written by the processor as it walks the file
  id, import_id not null, line int not null,
  raw jsonb not null,                      // the mapped source values, for display/debug
  material_id uuid?,                       // resolved via SKU-then-UPC
  quantity numeric?, serial text?,
  error text?                              // ParseRowError code (02 §6), null = clean
}                                          // UNIQUE (import_id, line) — retries upsert
                                           //   by that key, never duplicate rows

```

### `replenishments` + `replenishment_items` + `wms_counters`

```
replenishments {
  id, folio integer not null unique,      // per-tenant consecutive, see wms_counters
  warehouse_id not null → warehouses,     // destination
  import_id uuid? → replenishment_imports, // the source import (file + mapping trail);
                                           //   null only for a fileless manual doc
  evidence_photos text[] not null default '{}',    // R2 keys
  user_id not null → users, notes text?, created_at
}                                          // no deleted_at — document trail; corrections
                                           // happen via readjustments, never edits.
                                           // source_file_* moved onto the import row
                                           //   (2026-07-19) — the view reads the join
replenishment_items {
  id, replenishment_id not null, material_id not null,
  quantity numeric?,                       // unserialized
  serials text[]?,                         // serialized (units themselves land in
                                           //   material_units at confirm)
  storage_node_id uuid?                    // optional target node
}
wms_counters { id text pk, value integer not null }   // row 'replenishment_folio';
                                           // proposed 2026-07-19: module-local twin of
                                           // report_counters, incremented in the confirm tx
```

### `report_materials` — current tracking list per report (links 06/08)

| Column | Type / constraint |
|---|---|
| `id` | pk |
| `report_id` | not null → `reports.id` |
| `material_id` | not null → `materials.id` |
| `quantity` | numeric null — unserialized |
| `material_unit_id` | uuid null → `material_units.id`; `UNIQUE` where set (a unit is consumed once) |
| `source_warehouse_id` | not null → `warehouses.id` |
| `created_at` | — |

**This table is current state, not audit** — `PUT /reports/:id/materials` may replace
rows freely; the audit lives in `movements` (the consumption + compensating
readjustments the diff emits, 08 §3). Exactly one of `quantity`/`material_unit_id` per
row, matching the material's tracking mode (`CHECK` + validator).

## 3. Stock math (proposed 2026-07-19 — the load-bearing design decision)

**Balances are materialized; movements are the journal.** Every stock endpoint runs one
transaction (the WS driver exists for exactly this — `backend/CLAUDE.md`) that:

1. Validates (role, reason context, tracking mode, self-checkout constraints, source
   balance).
2. Inserts the `movements` row (+ `movement_units` rows when serialized).
3. Applies the delta: unserialized → upsert `stock_entries` (`+` at destination, `−` at
   source; row lock via `SELECT … FOR UPDATE` before decrement; `CHECK (quantity >= 0)`
   backstops races → `409 insufficient_stock`); serialized → update the units'
   `warehouse_id`/`storage_node_id`/`status`.

Deltas per type: `inbound` +to · `transfer` −from/+to · `consumption` −from ·
`readjustment` ±per `direction`. Invariant (reconciliation check, testable): for every
`(material, warehouse, node)`, the signed sum of movement quantities equals
`stock_entries.quantity`; for serialized, a unit's latest `movement_units` row agrees
with its current location/status.

## 4. Lifecycles

- **Serialized unit:** `in_stock` →(consumption on a report)→ `consumed` — a status
  flip, **no virtual "consumed" location** (proposed 2026-07-19); the row keeps its last
  warehouse/node so history reads naturally. `in_stock` →(readjustment-out with
  `damaged_material`/`stock_cleaning`/`doa`/loss)→ `lost`. Compensating
  readjustment-in on a correction flips `consumed`/`lost` back to `in_stock` at the
  recorded source (08 §3). `assigned` reserved (§2).
- **Reasons:** built-ins seeded per §5, locked. Custom: created by owner/admin (label +
  appliesTo → slugged code), label editable, deactivate-only. Inactive reasons disappear
  from selects but keep rendering in history (join by `code`).
- **Movements/replenishments:** created, never mutated.
- **Replenishment import:** `uploaded` →(mapping submitted)→ `queued` →(claimed by
  the processing service, lease taken)→ `processing` → `ready` | `failed`; stale
  lease → back to claimable, `attempts`++, over max ⇒ `failed`; `ready` →(confirm)→
  `confirmed`; any pre-confirm state →(user abandons / new upload replaces it)→
  `discarded`. Only the **processing service** (11) writes `processing →
  ready/failed` + the progress counters; only the confirm transaction writes
  `confirmed`. Terminal states: `failed`, `confirmed`, `discarded`.
  **File retention (owner 2026-07-19 — supersedes the 2026-07-05 keep-forever
  evidence-file decision):** the staged binary is **transient** — the **processor**
  deletes it from R2 once the file is fully processed (the `ready` write) and stamps
  `file_deleted_at`; `failed` imports keep their file for debugging. Files left
  staged by discarded/abandoned imports are collected by a retention sweep (open —
  11). DB rows are permanent as always — `rows.raw` + `file_name` + `mapping` are
  the audit substance. **Evidence photos are unaffected** — they stay in R2
  permanently.

## 5. Seed — the 11 built-in reasons (semantics confirmed 2026-07-05)

Seeded idempotently (insert-if-missing by `code`) at migration/provisioning time,
`built_in: true`:

| code | label (es) | applies_to |
|---|---|---|
| `replenishment` | Reabastecimiento | inbound |
| `refund_by_client` | Devolución de cliente | inbound, readjustment_in |
| `repair` | Reparación | readjustment_out, readjustment_in |
| `relocation` | Reubicación | transfer |
| `report_binding` | Consumo en reporte | consumption, readjustment_in, readjustment_out — **extended (proposed 2026-07-19)** so report-material corrections stay under one code (08 §3); never user-selectable in any dialog |
| `returned_to_client` | Entregado al cliente | readjustment_out |
| `return_to_provider` | Devolución a proveedor (cambio) | readjustment_out |
| `refund_to_provider` | Devolución a proveedor (reembolso) | readjustment_out |
| `damaged_material` | Material dañado | readjustment_out |
| `stock_cleaning` | Depuración de inventario | readjustment_out |
| `doa` | Dañado de origen (DOA) | readjustment_out |

Backend validates `type` ↔ `applies_to` on every movement (readjustments map through
`readjustment_{direction}`); `400 invalid_reason_context` / `400 reason_inactive`.

---

## Checkpoints

### CP-1 — Schema + seeds
- [ ] `wms/models/*.model.ts` (all §2 tables), enums, barrel relations; DDL applied to
      the live Neon DB (additive; SQL generated for the record)
- [ ] Reason seed idempotent + verified against §5 (codes, appliesTo, built_in)
- [ ] DB-level guards in place: partial uniques (technician, sku, node name), checks
      (quantity ≥ 0, readjustment↔direction, report_materials XOR)

### CP-2 — Repositories + invariants
- [ ] `wms/repository/*` — movements repo is insert+select only (no update/delete
      function exists, grep-provable); stock mutation helpers implement §3 inside a
      transaction with row locks
- [ ] Reconciliation test: scripted movement sequence → journal sum equals materialized
      balances (unserialized + serialized)
- [ ] Concurrency test: two parallel transfers off one balance — one lands, one gets
      `insufficient_stock`, balance never negative

## Open decisions / asks
- Confirm §6-of-overview proposals touching this file: materialized stock (3),
  `movement_units` (2), node soft-delete (3), folio counter (7), consumed-as-status (8),
  `assigned` reserved (10), any-type roots (11).
- Van-as-sub-warehouse assumption (carried from the original) — confirm with owner.
- Tracking-mode immutability: this file specs **immutable after first movement**
  (editable while virgin) — confirm, then 05 locks the UI accordingly.
- `unit` free-text vs closed list — spec'd free text + curated suggestions; revisit if
  garbage units show up in real data.
- Whether `report_materials.material_unit_id` unique should be partial (allow re-consume
  after a correction reverted the unit) — spec: **partial, `WHERE` the row is live**; a
  reverted unit must be consumable again. Backend to implement via row deletion on PUT
  (table is current-state), so a plain UNIQUE works — confirm during 08.
