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
enum MaterialTracking { Serialized = 'serialized',   // one row per piece, unique serial
                        Lot = 'lot',                  // added 2026-07-20 (owner): batch-
                                                      //   tracked consumables (nails,
                                                      //   rivets, washers) — identity per
                                                      //   lot number, quantity within it
                        Unserialized = 'unserialized' }
enum MaterialUnitStatus { InStock = 'in_stock', Assigned = 'assigned',
                          Consumed = 'consumed', Lost = 'lost' }
enum MovementType { Inbound = 'inbound', Transfer = 'transfer',
                    Consumption = 'consumption', Readjustment = 'readjustment' }
enum ReadjustmentDirection { In = 'in', Out = 'out' }
enum ReasonContext { Inbound = 'inbound', Transfer = 'transfer',
                     ReadjustmentIn = 'readjustment_in',
                     ReadjustmentOut = 'readjustment_out',
                     Consumption = 'consumption' }   // consumption: report_binding only
enum ImportEventType {                       // whole-lifecycle audit (owner 2026-07-20)
  Created = 'created',                        // register/upload — the "start"
  MappingSubmitted = 'mapping_submitted',     // /process
  ProcessingStarted = 'processing_started',   // consumer claimed (system actor)
  Processed = 'processed',                    // → ready (system)
  ProcessingFailed = 'processing_failed',     // → failed (system)
  RowUpdated = 'row_updated',                 // staged-row edit
  RowRemoved = 'row_removed',                 // staged-row removal (owner/admin)
  EvidenceUpdated = 'evidence_updated',
  NotesUpdated = 'notes_updated',
  Rejected = 'rejected',                      // owner/admin sent back with a comment (2026-07-20)
  Resubmitted = 'resubmitted',                // office re-requested approval after adjusting
  Stale = 'stale',                            // benign abandon / superseded (was 'discarded')
  Cancelled = 'cancelled',                    // owner-only full cancel — reason required (2026-07-20)
  Approved = 'approved' }                     // admin/owner confirmation → doc created
enum ReplenishmentImportStatus {                     // added 2026-07-19 (owner ask)
  Uploaded = 'uploaded',      // file stored, fields detected, awaiting mapping
  Queued = 'queued',          // mapping submitted, waiting for the processor to claim
  Processing = 'processing',  // delivered to the queue consumer, job running
  Ready = 'ready',            // rows parsed + validated, preview available — awaiting approval
  Rejected = 'rejected',      // owner/admin sent it back with a comment (2026-07-20) —
                              //   office adjusts, then resubmit → ready. NON-terminal,
                              //   still in-flight (staging intact); NOT stale/cancelled
  Failed = 'failed',          // whole-file failure or max attempts (import.error set)
  Confirmed = 'confirmed',    // replenishment created from this import
  Stale = 'stale',            // benign abandon / superseded (was 'discarded'); cron-swept
  Cancelled = 'cancelled' }   // owner-only full cancel (2026-07-20): staging truncated
                              //   + record closed, required reason; terminal
```

`STORAGE_NODE_RANK: Record<StorageNodeType, number>` (`wms/constants/`) —
`storage_unit: 1, rack: 2, section: 3, storage_box: 4`; hierarchy rule in §2.
`UNPROCESSABLE_ROW_ERRORS = ['duplicate_serial', 'serial_exists']` (`wms/constants/`)
— the fixable-vs-unprocessable row-error split (owner 2026-07-20; **serials only** —
lot collisions are legitimate top-ups, not errors, since re-receipt was enabled
2026-07-20: a lot number is a batch label, not a unique physical identity). Semantics
in 02 §6, shared with the frontend mirror constant.

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

### `material_lots` — lot balances per location (added 2026-07-20, owner)

Batch-tracked consumables: technicians consume *quantities* out of identified
batches. A row is **one lot's balance at one location** (a lot split across the
shop and a van = two rows); the lot's identity is `(material_id, lot_number)`.

| Column | Type / constraint |
|---|---|
| `id` | pk |
| `material_id` | not null → `materials.id` (a `lot`-tracked material) |
| `lot_number` | text, not null |
| `warehouse_id` / `storage_node_id` | location (node nullable) |
| `quantity` | numeric(12,3), not null, `CHECK (quantity >= 0)` |
| `expires_at` | timestamptz null (**added 2026-07-20, owner — lot expiry**): a property of the lot *number*, captured only when the import/inbound provides it. Denormalized here (a lot split across locations repeats it); the service keeps it consistent — first receipt sets it, top-up keeps it, transfer inherits the source row's value, and a fresh location for an existing `(material, lot_number)` reuses that lot's known expiry. Null = no expiry tracked (the common case) |
| — | `UNIQUE NULLS NOT DISTINCT (material_id, lot_number, warehouse_id, storage_node_id)` |
| `created_at` | — no `deleted_at`: a drained lot row keeps its zero balance (history reads naturally; the drained-lot cleanup question is deliberately not asked until real data hoards rows) |

**Lot re-receipt = top-up (enabled 2026-07-20, owner):** receiving a lot number that
already exists — in the same file or already in stock — is **not an error**; it adds
to that lot's balance at the destination (the `stock_entries`-style upsert, §3). Lot
identity is `(material_id, lot_number)`; there is no `lot_exists`/`duplicate_lot`
error. Accepted trade-off: a typo'd lot number silently merges into the wrong lot —
same risk profile as any quantity entry, and the movement history records it.

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
| `quantity` | numeric null — unserialized + lot movements; serialized movements use `movement_units` |
| `lot_number` | text null — set on lot-tracked movements (which lot the quantity moved in/out of) |
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
| `built_in` | boolean, not null, default false — the 13 seeds (§5); **fully locked** (no label edits, no deactivation) |
| `applies_to` | text[] of `ReasonContext`, not null, ≥1 |
| `active` | boolean, not null, default true — deactivate instead of delete; **no DELETE path** |
| `created_at` | — |

### `replenishment_imports` + `replenishment_import_rows` — the batch job (added 2026-07-19, owner ask)

File imports are **asynchronous batch jobs with DB-backed status** — the database row
is the single source of truth the frontend listens to (SSE stream + one-shot reads
— 02 §6). Processing runs in the backend's
own **Cloudflare Queues consumer** (11 — decided 2026-07-19); the DB-first contract
is what keeps later extraction to an external service possible **without any
contract change** (02 §6):

```
replenishment_imports {
  id, status ReplenishmentImportStatus not null default 'uploaded',
  file_key text not null, file_name text not null,   // staged in R2 at upload (07 §4);
                                           //   the key is the reference the processor
                                           //   pulls the file by
  file_deleted_at timestamptz?,            // set when the binary is PURGED (owner
                                           //   2026-07-19 — space): by the queue
                                           //   consumer, once fully processed.
                                           //   key/name stay as the reference; the
                                           //   durable content record is rows.raw
  detected_fields jsonb not null,          // [{ id, header, samples: string[] }] —
                                           //   sniffed at upload for the field mapper
  mapping jsonb?,                          // { sku, quantity?, serial?, lot?,
                                           //   expiry? } → field ids, set at /process
  submission_snapshot text?,               // owner 2026-07-20: the whole submission
                                           //   as HUMAN-READABLE pretty-printed JSON,
                                           //   stored as PLAIN TEXT (not jsonb — keeps
                                           //   exact formatting; a tamper-evident,
                                           //   exportable audit artifact). Written at
                                           //   /process: { fileName, warehouse,
                                           //   detectedFields, mapping, submittedBy,
                                           //   submittedAt }. Immutable; the header
                                           //   persists forever so it survives approval
  warehouse_id uuid?,                      // destination, set with the mapping
  total_rows int?, processed_rows int not null default 0,
  error_rows int not null default 0,       // progress counters the processor updates
  error text?,                             // whole-file failure detail (status failed)
  attempts int not null default 0,         // mirror of the queue message's delivery
                                           //   attempt — visibility only; Queues owns
                                           //   retry state, DLQ ⇒ 'failed' (11 §3)
  evidence_photos text[] not null default '{}',
  notes text?,                             // approval-stage PREP (owner 2026-07-19):
                                           //   evidence + notes attach AFTER processing,
                                           //   staged here (PATCH — 02 §6) so office can
                                           //   prep and an admin can approve later;
                                           //   copied onto the doc at approval
  user_id not null → users, created_at, updated_at
}                                          // never deleted — abandoned = 'stale',
                                           //   owner-cancelled = 'cancelled'.
                                           // ONE IN-FLIGHT PER TENANT (owner
                                           //   2026-07-20): partial unique index
                                           //   UNIQUE ((true)) WHERE status IN
                                           //   ('uploaded','queued','processing',
                                           //   'ready','rejected') — DB-enforces a
                                           //   single pre-approval import (rejected
                                           //   is still in-flight); POST maps the
                                           //   violation to 409 import_in_progress
replenishment_import_rows {                // the STAGING ("temp") table — owner
                                           //   2026-07-19: parsed data lives here,
                                           //   in the tenant DB, until approval
  id, import_id not null, line int not null,
  raw jsonb not null,                      // the mapped source values, for display/debug
  material_id uuid?,                       // resolved via SKU-then-UPC
  quantity numeric?, serial text?,
  lot text?,                               // lot-tracked rows: lot number + quantity
  lot_expires_at timestamptz?,             // parsed from the mapped expiry field
                                           //   (2026-07-20) when present; else null
  storage_node_id uuid?,                   // optional target node, set by the user
                                           //   during review (never by the processor)
  error text?                              // ParseRowError code (02 §6), null = clean
}                                          // UNIQUE (import_id, line) — retries upsert
                                           //   by that key, never duplicate rows.
                                           // MUTABLE while status IN ('ready',
                                           //   'rejected') (edits + removals
                                           //   PATCH/DELETE here, each AUDITED —
                                           //   below; re-resolved server-side —
                                           //   02 §6). 'rejected' = admin returned it;
                                           //   office adjusts then resubmits → 'ready'.
                                           // Approval MOVES the data: promoted into
                                           //   the inventory tables, then the staged
                                           //   rows are DELETED in the same tx (owner
                                           //   2026-07-19 — sanctioned exception to
                                           //   no-hard-deletes: staging ≠ entity;
                                           //   the promoted doc is the record).
                                           // Owner CANCEL (2026-07-20) TRUNCATES these
                                           //   rows immediately + closes the record
                                           //   ('cancelled'); the required-reason
                                           //   'cancelled' event is the surviving trail
                                           //   (same sanctioned staging exception)
replenishment_import_events {              // append-only audit of the WHOLE import
                                           //   lifecycle — start button → admin/owner
                                           //   confirmation (owner 2026-07-20). NEW
                                           //   TABLE. Guards against silent quantity
                                           //   fiddling and makes the process
                                           //   accountable end-to-end.
  id, import_id not null → replenishment_imports,   // header persists forever, so
                                           //   the log outlives the ephemeral staged
                                           //   rows (survives approval)
  type ImportEventType not null,           // the 14 lifecycle events above
  actor_user_id uuid? → users,             // who did it; NULL for system events
                                           //   (processing_started/processed/failed —
                                           //   emitted by the queue consumer)
  line int?,                               // set on row_updated/row_removed (the
                                           //   staged line — NOT an FK, rows vanish)
  reason text?,                            // REQUIRED on row_removed (audit comment),
                                           //   on rejected (the admin's feedback shown
                                           //   to office to adjust), and on cancelled
                                           //   (the owner's reason for the full cancel)
  details jsonb not null default '{}',     // event-specific: row_updated { field:
                                           //   {from,to} }; row_removed row snapshot;
                                           //   mapping_submitted { warehouse, mapping };
                                           //   processed { total, errors }; failed
                                           //   { error }; approved { folio,
                                           //   replenishmentId }; rejected's + cancelled's
                                           //   comment rides `reason` (details {});
                                           //   resubmitted {}
  created_at
}                                          // no deleted_at, no UPDATE/DELETE path —
                                           //   append-only like movements/interactions.
                                           //   The full timeline of every import.

```

### `replenishments` + `replenishment_items` + `wms_counters`

```
replenishments {
  id, folio integer not null unique,      // per-tenant consecutive, see wms_counters
  warehouse_id not null → warehouses,     // destination
  import_id uuid? → replenishment_imports, // the source import (file + mapping trail);
                                           //   v1 always set — every doc is born by
                                           //   approving an import (nullable reserved
                                           //   for a future fileless manual path)
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
                                           //   material_units at approval)
  lot text?, lot_expires_at timestamptz?,  // lot-tracked: lot number (+ quantity,
                                           //   + optional expiry); approval upserts
                                           //   material_lots (top-up if it exists)
  storage_node_id uuid?,                   // optional target node
  unprocessable boolean not null default false,
  error text?                              // owner 2026-07-20: serial-collision rows
                                           //   (duplicate_serial / serial_exists)
                                           //   promote as VISIBLE but UNPROCESSED
                                           //   items — no movement, no units, no
                                           //   stock effect — so staff see the
                                           //   duplicate and review records /
                                           //   contact the provider. error keeps
                                           //   the ParseRowError code
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
| `quantity` | numeric null — unserialized + lot |
| `lot_number` | text null — lot-tracked consumption: which of the van's lots the quantity came from |
| `material_unit_id` | uuid null → `material_units.id`; `UNIQUE` where set (a unit is consumed once) |
| `source_warehouse_id` | not null → `warehouses.id` |
| `created_at` | — |

Shape per tracking mode (`CHECK` + validator): serialized → `material_unit_id`;
lot → `quantity` + `lot_number`; unserialized → `quantity` alone.

**This table is current state, not audit** — `PUT /reports/:id/materials` may replace
rows freely; the audit lives in `movements` (the consumption + compensating
readjustments the diff emits, 08 §3). Exactly one of `quantity`/`material_unit_id` per
row, matching the material's tracking mode (`CHECK` + validator).

### `settings` — generic key-value store (added 2026-07-19, owner; cross-cutting `modules/settings/`)

| Column | Type / constraint |
|---|---|
| `id` | pk |
| `key` | text, not null, unique — namespaced `<domain>.<name>` |
| `value` | jsonb, not null |
| `updated_at` | not null |

A deliberately generic per-tenant store that **scales vertically: new settings = new
rows, never new columns** (owner 2026-07-19 — more keys will land here later).
First key — `wms.last_replenishment_mapping`:

```
{ headers: string[],                       // the detected header texts at save time
  mapping: { sku: string, quantity?: string,
             serial?: string, lot?: string } }                     // by HEADER TEXT
```

Stored by **header text, not field id** (field ids are per-import): upserted on every
successful `/process` (02 §6); the upload/detect endpoint returns a field-id-resolved
`suggestedMapping` when the incoming headers match — the mapper prefill that saves
users the re-mapping (07 §2 step 3).

**Second key — `notifications.manager_user_id`** (owner 2026-07-20): the configured
**CMS-manager user** who receives operational warnings — the new config record.

```
{ userId: string }                         // → users.id; the notification recipient
```

Cross-cutting, not WMS-specific (replenishment is just its first consumer, the same
way `wms.last_replenishment_mapping` was the settings table's first key). Set at
**tenant provisioning by the whitelabel manager** (the owner-provisioning precedent;
an in-tenant owner settings screen to change it is a later add — asks §00 §5). Read
backend-side via `getSetting('notifications.manager_user_id')`; **absent ⇒
notifications skip silently** (logged, never an error) — the in-app pending strip
(07 §2) is always the floor. Drives the approval banner (07 §2/§3) + the queue
consumer's warning email (11 §2).

## 3. Stock math (proposed 2026-07-19 — the load-bearing design decision)

**Balances are materialized; movements are the journal.** Every stock endpoint runs one
transaction (the WS driver exists for exactly this — `backend/CLAUDE.md`) that:

1. Validates (role, reason context, tracking mode, self-checkout constraints, source
   balance).
2. Inserts the `movements` row (+ `movement_units` rows when serialized).
3. Applies the delta: unserialized → upsert `stock_entries`; **lot → upsert
   `material_lots`** keyed by lot + location (added 2026-07-20 — same mechanics,
   one more key column; inbound onto an existing lot **tops up** its balance —
   re-receipt, above); both use `+` at destination, `−` at source, row lock via
   `SELECT … FOR UPDATE` before decrement, `CHECK (quantity >= 0)` backstopping
   races → `409 insufficient_stock`. **Lot expiry** rides the upsert: on a
   destination row the service sets `expires_at` from the movement's expiry when
   the lot is new, reuses any existing `expires_at` for that `(material,
   lot_number)` otherwise, and a transfer copies the source lot's `expires_at`
   onto the destination row (keeps a split lot's expiry consistent). Serialized →
   update the units' `warehouse_id`/`storage_node_id`/`status`.

Deltas per type: `inbound` +to · `transfer` −from/+to · `consumption` −from ·
`readjustment` ±per `direction`. Invariant (reconciliation check, testable): for every
`(material, warehouse, node)` — and for lot materials every
`(material, lot_number, warehouse, node)` — the signed sum of movement quantities
equals the materialized balance (`stock_entries` / `material_lots`); for serialized,
a unit's latest `movement_units` row agrees with its current location/status.

## 4. Lifecycles

- **Serialized unit:** `in_stock` →(consumption on a report)→ `consumed` — a status
  flip, **no virtual "consumed" location** (proposed 2026-07-19); the row keeps its last
  warehouse/node so history reads naturally. `in_stock` →(readjustment-out with
  `damaged_material`/`stock_cleaning`/`doa`/`scrap`/loss)→ `lost`. Compensating
  readjustment-in on a correction flips `consumed`/`lost` back to `in_stock` at the
  recorded source (08 §3). `assigned` reserved (§2).
- **Reasons:** built-ins seeded per §5, locked. Custom: created by owner/admin (label +
  appliesTo → slugged code), label editable, deactivate-only. Inactive reasons disappear
  from selects but keep rendering in history (join by `code`).
- **Movements/replenishments:** created, never mutated.
- **Replenishment import:** `uploaded` →(mapping submitted + queue message sent)→
  `queued` →(delivered to the queue consumer)→ `processing` → `ready` | `failed`;
  failed/timed-out deliveries redeliver (idempotent handler), retry cap → DLQ ⇒
  `failed`; `ready` = **awaiting
  approval** — staged rows sit in the temp table, editable via row PATCH.
  From `ready`, owner/admin either **approve** or **reject with a comment** (owner
  2026-07-20) → `rejected`: office adjusts the staged rows then **resubmit** → back
  to `ready` (both logged, re-notifies the manager). →(**approval**)→ `confirmed`:
  one transaction **moves the staged rows into the actual inventory tables** —
  replenishment doc + items; processable rows emit inbound movements + stock (§3),
  **unprocessable rows (serial collisions — owner 2026-07-20) become flagged,
  movement-less items** — then deletes the staging (below). Any pre-approval state
  →(user abandons / new upload replaces it)→ `stale`, or →(**owner** cancels with a
  required reason — 2026-07-20)→ `cancelled` (staging truncated immediately, record
  closed). Only the **queue consumer** (11) writes `processing → ready/failed` + the
  progress counters; only the approval transaction writes `confirmed`. Terminal
  states: `failed`, `confirmed`, `stale`, `cancelled`.
  **Staged rows are deleted in the approval transaction** after promotion (owner
  2026-07-19 — true move semantics; the deliberate, flagged exception to the
  no-hard-deletes rule: staging is a temp table, not a user-facing entity. The
  record is the promoted doc + items + movements, plus the import header row —
  `file_name` + `mapping` — which is kept). Staging left behind by `stale`/
  `failed` imports is cleaned by the daily cron (11 §4); owner-`cancelled` imports
  truncate their staging immediately, so the cron finds nothing to sweep for them.
  **File retention (owner 2026-07-19 — supersedes the 2026-07-05 keep-forever
  evidence-file decision):** uploads are **copies** — the tenant keeps the original
  file outside the system, so the staged binary has **zero archival value** and is
  purely **transient**: the **queue consumer** deletes it from R2 once the file is
  fully processed (the `ready` write) and stamps `file_deleted_at`; `failed` imports
  keep their file only as retry/debug input. Leftover binaries (stale/abandoned/
  failed imports) are collected by the daily retention cron (decided — 11 §4);
  owner-`cancelled` imports purge their binary in the cancel transaction.
  Post-approval, the in-system record is the **promoted doc + items + movements**
  plus the import header (`file_name`, `mapping`) — staged rows are
  moved-then-deleted (lifecycle above). **Evidence photos are unaffected** — they
  stay in R2 permanently.

## 5. Seed — the 13 built-in reasons (semantics confirmed 2026-07-05; `scrap` + `lot_expired` added 2026-07-20)

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
| `scrap` | Merma | readjustment_out — **added 2026-07-20 (owner)**: scrapped/waste material (offcuts, unusable remnants); 12th seed |
| `lot_expired` | Lote vencido | readjustment_out — **added 2026-07-20 (owner)**: manual write-off of an expired lot (manual FEFO — the expiry pill flags it, an admin readjusts it out); 13th seed |

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
- ~~Lot re-receipt~~ — **enabled 2026-07-20 (owner):** top-up, not an error (above).
  Remaining sub-question: a top-up whose provided expiry *differs* from the lot's
  stored expiry — v1 keeps the existing value (a differing expiry usually means a
  mistyped lot number). Add a `lot_expiry_conflict` warning only if real data shows
  it happening.
- ~~Lot expiry~~ — **enabled 2026-07-20 (owner), display-only + manual FEFO:**
  `expires_at` per lot, captured when the field is present (above). **Manual FEFO**
  is served by the `lot_expired` readjustment-out reason (§5) — the expiry pill
  flags a lot, an admin readjusts it out; lot selects sort by soonest expiry as a
  nudge (06 §3). Consuming an expired lot on a report **warns via a confirm dialog**
  (08 §2) but is allowed. **Not built in v1** (revisit on demand): *automatic* FEFO
  enforcement (forcing consumption from the oldest lot) and *hard-blocking*
  expired-lot consumption (v1 warns, doesn't block). If a lot workload ever
  gets heavy, normalize expiry into a `(material_id, lot_number)` lot-header table
  instead of the denormalized column.
- Whether `report_materials.material_unit_id` unique should be partial (allow re-consume
  after a correction reverted the unit) — spec: **partial, `WHERE` the row is live**; a
  reverted unit must be consumable again. Backend to implement via row deletion on PUT
  (table is current-state), so a plain UNIQUE works — confirm during 08.
