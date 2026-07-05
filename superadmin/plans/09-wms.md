# 09 — WMS (small warehouse management)

> **Status:** not-started · **Depends on:** 02 (CP-3), 03 (CP-1), 04 (CP-2)
> **Owner:** — · **Last updated:** 2026-07-05

A small WMS: warehouses (with sub-warehouses), an internal location hierarchy, a material
catalog (serialized / unserialized), stock, **technician-assigned warehouses**, and
**material tracking attached to reports**. The largest module — its checkpoints are
deliberately smaller slices.

**Roles — action-level matrix in `10-access-control.md` §2.1** (decided 2026-07-05):
owner/admin full; **office is operational** (inbound + transfers incl. van loading; no
structure/catalog, no readjustments); **technician** gets **My warehouse** (own van stock +
consumption history + **self-checkout**: transfer with destination locked to own van,
source excluding other techs' warehouses) and **Stock lookup** (global read-only
quantities per warehouse). Reuse components with locked filters + hidden actions; don't
fork variants. Module is behind the tenant `wms` config flag.

---

## 1. Data model (DTO view)

### Locations

```
Warehouse {
  id, name,
  type: 'warehouse' | 'sub-warehouse',   // derived: parentId set ⇒ 'sub-warehouse'
  parentId?,                             // one level of nesting v1 (confirm: deeper?)
  assignedTechnicianId?,                 // ← technician stock (van); user detail in 03
                                         //   shows this read-only
  address?, notes?, createdAt, deletedAt?
}
StorageNode {                            // the inside-a-warehouse hierarchy
  id, warehouseId,
  type: 'storage_unit' | 'rack' | 'section' | 'storage_box',
  parentNodeId?,                         // unit → rack → section → box (strict order,
                                         // levels skippable: a box directly in a unit is ok)
  name / code,                           // short label, unique within parent
}
```

One adjacency-list `StorageNode` entity with a `type` enum (not four tables/DTOs) — the
UI renders it as a `<p-tree>`; hierarchy-order validation lives where the node form
offers only legal parent types.

### Materials + stock

```
Material {
  id, sku?, name, description?, unit,     // 'pza', 'm', 'kg', ...
  tracking: 'serialized' | 'unserialized',
  minStock?,                              // low-stock pill threshold
  createdAt, deletedAt?
}
MaterialUnit {                            // serialized only: one row per physical piece
  id, materialId, serialNumber,
  warehouseId, storageNodeId?,
  status: 'in_stock' | 'assigned' | 'consumed' | 'lost'
}
StockEntry {                              // unserialized: qty per location
  materialId, warehouseId, storageNodeId?, quantity
}
Movement {                                // audit trail — APPEND-ONLY, backend-generated
  id, type: 'inbound' | 'transfer' | 'consumption' | 'readjustment',
  direction?: 'in' | 'out',               // readjustment only: which way stock moved
  reason: MovementReason,                 // REQUIRED on every movement (structured why)
  materialId, quantity? | materialUnitIds?,
  fromWarehouseId?/fromNodeId?, toWarehouseId?/toNodeId?,
  reportId?,                              // set on consumption via report tracking
  userId, createdAt,
  notes?,                                 // free-text detail; REQUIRED for readjustment
}
MovementReason =
  'relocation' | 'report_binding' | 'returned_to_client' | 'return_to_provider'
  | 'refund_by_client' | 'refund_to_provider' | 'damaged_material' | 'replenishment'
  | 'stock_cleaning' | 'repair' | 'doa'
```

**Movement reasons (decided 2026-07-05):** every movement carries a structured `reason`
(filterable/analyzable) alongside free-text `notes`. Constants + labels live in
`data/dtos/wms/movement-reasons.ts`. Typical pairings — backend validates the legal
`type` ↔ `reason` combinations (final matrix is a backend ask):

| Reason | Typical movement |
|---|---|
| `replenishment` | inbound (normal restock from provider) |
| `refund_by_client` | inbound / readjustment-in (client returned material to us) |
| `repair` | readjustment-out (sent to repair) / -in (back from repair) |
| `relocation` | transfer (any stock move, incl. van loading + self-checkout default) |
| `report_binding` | consumption — **auto-set** by the report-materials editor, never user-selectable |
| `returned_to_client` | readjustment-out (client-owned part handed back) |
| `return_to_provider` | readjustment-out (exchange/replacement expected) |
| `refund_to_provider` | readjustment-out (sent back for money back) |
| `damaged_material` | readjustment-out (+ serialized unit status flip) |
| `stock_cleaning` | readjustment-out (inventory cleanup / write-off) |
| `doa` | readjustment-out (dead on arrival, right after inbound) |

**Immutability rule (decided 2026-07-05):** movements are **never edited or deleted** —
no endpoint, no UI affordance, period. Every correction is a **new `readjustment`
movement** (owner/admin only, `direction: in|out`, reason required): counting errors,
damaged/lost stock (serialized: the unit's status flips to `lost` *and* a
readjustment-out records it), and staff corrections to report materials (backend emits
compensating readjustments; the original consumption movement stands). The movements
history is the truth of what happened, including the mistakes.

```
```

### Report material tracking (links 04)

```
ReportMaterial {                          // a report MAY have zero of these
  id, reportId, materialId,
  quantity? | materialUnitId?,            // by tracking mode
  sourceWarehouseId                       // normally the technician's assigned warehouse
}
```

## 2. Expected API surface

- `GET/POST/PATCH/DELETE /warehouses` (+ `?parentId`, tree endpoint `GET /warehouses/tree`)
- `POST /warehouses/:id/assign-technician` `{ userId }` (one active warehouse per
  technician — backend enforces; confirm)
- `GET/POST/PATCH/DELETE /warehouses/:id/nodes` (subtree ops)
- `GET/POST/PATCH/DELETE /materials` (+ search, `?tracking=`)
- `GET /materials/:id/stock` — per-location breakdown (+ serialized units list)
- `POST /stock/inbound` · `POST /stock/transfer` · `POST /stock/readjust` — all take a
  required `reason` (readjust additionally: `{ direction, notes }` required; no
  PATCH/DELETE on movements exists)
- `GET /reports/:id/materials` · `PUT /reports/:id/materials` (set/replace tracking list)
- `GET /movements?materialId&warehouseId&reportId&type&reason&from&to` → paged

## 3. Pages & components

- `wms/pages/warehouses-list/` — table of root warehouses; expandable to sub-warehouses;
  technician badge when assigned. Actions: add warehouse / add sub-warehouse (form dialog,
  shape 3), assign technician (dialog listing technicians from 03's state).
- `wms/pages/warehouse-view/` — header card + **`<p-tree>` of StorageNodes** (lazy
  children); node context actions (add child of legal type, rename, delete-if-empty);
  right panel: stock at selected node.
- `wms/pages/materials-list/` — table: sku, name, tracking pill, unit, total stock,
  low-stock pill (`quantity < minStock`). Filters: search, tracking mode.
- `wms/pages/material-view/` — detail + per-location stock table; serialized: unit list
  with serial + status pills; movements history (paged) below.
- `wms/components/inbound-dialog/` — receive stock into a warehouse/node (serialized:
  textarea of serials, one per line; unserialized: quantity). Required `reason` select
  (defaults `replenishment`).
- `wms/components/readjustment-dialog/` — owner/admin only: direction (in/out), material
  + qty or serialized units, location, required `reason` select (only reasons legal for
  the chosen direction) + **required free-text notes** (mirrors the delete-dialog
  audit-comment convention). This is the *only* way stock is corrected.
- `wms/components/transfer-dialog/` — move stock/units between warehouse/node pairs;
  the common case "load technician van" is this dialog with the target pre-set to the
  tech's warehouse. Required `reason` select (defaults `relocation`). **Technician mode =
  self-checkout:** same dialog with destination locked to their own van, source list
  excluding other technicians' warehouses, reason fixed to `relocation` (backend enforces
  all three; `10-access-control.md` §2.1a).
- `wms/components/report-materials-editor/` — fills 04's reserved materials slot on
  report-view: table of `ReportMaterial` rows + add-row picker (material → mode-appropriate
  qty/serial input, source defaults to the report technician's warehouse). Owned by this
  module's agent, lives under `wms/` and is imported by the report view.
  **Role behavior** (`10-access-control.md` §2.1b): technician can add/edit on **their own
  reports**, materials sourced from **their own van only**; owner/admin edit any report's
  materials, any source; office renders it read-only.
- `wms/pages/stock-lookup/` — technician's global read-only view: `materials-list` +
  `material-view` reused with all actions hidden, per-warehouse quantities visible, no
  movements/adjustment detail.

## 4. State

- `WarehousesState`: tree, selected, nodes subtree cache. Actions: CRUD + `AssignTechnician`.
- `MaterialsState`: list/detail/stock/movements. Actions: CRUD + `LoadStock(materialId)`,
  `Inbound`, `Transfer`, `Readjust`, `LoadMovements(query)`.
- `ReportMaterialsState` (small): `LoadReportMaterials(reportId)`, `SaveReportMaterials`.
- `src/http/wms.service.ts` (split into `warehouses.service.ts` + `materials.service.ts`
  if it grows past ~150 lines).

---

## Checkpoints

### CP-1 — Warehouses
- [ ] Warehouse DTOs + service + state
- [ ] Warehouses list (roots + sub-warehouses, type derived from parent)
- [ ] Warehouse form dialog (parent select ⇒ sub-warehouse) + delete (empty only)
- [ ] Route + sidebar entry live

### CP-2 — Storage hierarchy
- [ ] StorageNode DTO + subtree endpoints wired
- [ ] Warehouse view with `<p-tree>`, legal-parent-type node forms, delete-if-empty

### CP-3 — Materials catalog
- [ ] Material DTOs + service + state; list + form (tracking mode immutable after create —
      confirm w/ backend)
- [ ] Material view with per-location stock + serialized units table

### CP-4 — Stock operations
- [ ] Inbound dialog (both tracking modes) — owner/admin/office
- [ ] Transfer dialog (incl. technician-van preset) — owner/admin/office
- [ ] **Self-checkout**: transfer dialog technician mode (destination locked to own van,
      source excludes other techs' warehouses)
- [ ] Movement-reason constants (`movement-reasons.ts`) + required reason select in
      inbound/transfer/readjustment dialogs (sensible defaults per dialog)
- [ ] Readjustment dialog (owner/admin, direction in/out, direction-legal reasons,
      required notes); no edit/delete affordance anywhere on movements
- [ ] Movements history on material view (type + reason tags shown, filterable by
      reason)
- [ ] Technician assignment dialog on warehouses list; read-only badge handshake with 03

### CP-5 — Report material tracking + roles + polish
- [ ] `report-materials-editor` in 04's slot (add/edit/remove, source defaulting)
- [ ] Consumption reflected in stock (backend does the math; UI refreshes)
- [ ] "My warehouse" technician route (own van + consumption history + self-checkout
      entry point) and "Stock lookup" route; office gating per §2.1 (operational, no
      structure/readjust); route `data` declared on all pages
- [ ] Dark-mode audit; empty/loading/error states everywhere
- [ ] Build green; manual pass: create warehouse + sub + rack/box → inbound 10 pza + 2
      serials → transfer to tech van → attach to report → stock decremented

## Open decisions / asks
- Backend asks from §2.1: enforce self-checkout constraints (destination = requester's
  van, source ∉ other techs' warehouses, reason = `relocation`), consumption only from
  own van on own reports, office blocked from structure/catalog/readjust endpoints,
  **movements table append-only (no UPDATE/DELETE paths at all)**, report-material
  corrections emit compensating readjustments server-side, and the final legal
  `type` ↔ `reason` validation matrix (§1 table is the proposal).
- Reason semantics to confirm: `refund_by_client` assumed = client returns material to
  us (stock in); `refund_to_provider` assumed = we send material back for money back
  (stock out) vs `return_to_provider` = exchange/replacement expected. Confirm both
  readings before backend validation is written.
- Nesting depth: one level of sub-warehouses enough for v1?
- Can a **sub-warehouse** be the technician-assigned one (van as sub of main)? Assumed yes.
- Tracking-mode immutability after first movement — backend rule, confirm.
- Serialized consumption on report: mark `consumed` vs transfer to a virtual "consumed"
  location — backend decision, UI shows status either way.
- Ask to 03: user detail shows assigned warehouse read-only (link to warehouse view).
