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
  replenishmentId?,                       // set on movements emitted by a replenishment
  userId, createdAt,
  notes?,                                 // free-text detail; REQUIRED for readjustment
}
MovementReasonDef {                       // reasons are DATA, not a closed enum
  id, code,                               // slug — immutable once created
  label,                                  // display text (cosmetic edits allowed)
  builtIn: boolean,                       // the 11 seeded reasons below
  appliesTo: ('inbound'|'transfer'|'readjustment_in'|'readjustment_out')[],
  active: boolean                         // deactivate instead of delete — NEVER deleted
}
```

**Movement reasons (decided 2026-07-05, extensible 2026-07-05):** every movement carries
a structured `reason` code (filterable/analyzable) alongside free-text `notes`.
`Movement.reason` stores the `code` of a `MovementReasonDef`. The 11 built-ins below are
backend-seeded and non-editable; **owner/admin can add custom reasons** (label +
applicability; code auto-slugged) from inside the reason select itself. Reasons in use
are never deleted — only deactivated (hidden from selects, still rendered in history).
`data/dtos/wms/movement-reasons.ts` keeps only the built-in codes that need
special-casing in the UI (`report_binding` auto-set, `relocation` for self-checkout);
the live list comes from the API. Built-in pairings (**semantics confirmed
2026-07-05**) — backend validates `type` ↔ `appliesTo`:

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

### Replenishments (bulk restock — first-class entity)

Bulk restocking is registered as a **document**, not ad-hoc inbound clicks
(decided 2026-07-05): admins **or office** import a stock list from a file and attach
evidence photos; confirming it emits the inbound movements.

```
Replenishment {
  id, folio,                              // per-tenant consecutive
  warehouseId,                            // destination
  sourceFileKey?, sourceFileName?,        // the uploaded .xlsx/.csv/.txt, kept in R2
                                          // as part of the evidence trail
  evidencePhotos: string[],               // R2 keys (delivery photos, invoices, pallets)
  items: ReplenishmentItem[],
  userId, createdAt, notes?
}
ReplenishmentItem {
  id, materialId,                         // resolved from the file's SKU column
  quantity? | serials: string[],          // by the material's tracking mode
  storageNodeId?                          // optional target node within the warehouse
}
```

- **Import formats:** `.xlsx`, `.csv`, `.txt` (delimiter-sniffed). Fixed template —
  columns `sku`, `quantity`, `serial` (serialized: one row per unit, `quantity` = 1) —
  with a downloadable template file on the register page.
- **Parsing is backend-side:** upload → backend stores the file in R2, parses, returns
  rows + per-row errors (unknown SKU, bad quantity, duplicate serial). The UI renders a
  preview table where rows can be fixed inline before confirming. One parser, and the
  source file is already archived when the preview appears.
- **Confirm** creates the `Replenishment` and emits one inbound `Movement` per item
  (`reason: replenishment`, `replenishmentId` set) — stock math stays in movements;
  the replenishment is the traceable document on top. Append-only rules apply:
  a wrong replenishment is corrected with readjustments, never edited.

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
- `GET /replenishments?warehouseId&from&to&page&limit` → paged ·
  `GET /replenishments/:id`
- `POST /replenishments/parse` (multipart: the .xlsx/.csv/.txt) → `{ fileKey, rows,
  rowErrors }` · `POST /replenishments` (`{ warehouseId, fileKey?, items, evidencePhotos,
  notes }` → creates doc + emits inbound movements). Evidence photos go through the
  existing `POST /upload` → R2 keys.
- `GET /movement-reasons` (active + inactive, `builtIn` flagged) ·
  `POST /movement-reasons` (owner/admin: label + appliesTo; code slugged server-side) ·
  `PATCH /movement-reasons/:id` (label/active only; code immutable; built-ins locked;
  **no DELETE endpoint**)

## 3. Pages & components

WMS sub-navigation (tabs within the Warehouse area): **Warehouses · Materials ·
Replenishments**.

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
- `wms/pages/replenishments-list/` — the Replenishments tab: table (folio, warehouse,
  item count, registered by, date, evidence count) + filters (warehouse, date range) +
  **"Register replenishment"** button → routes to the register page. Owner/admin/office.
- `wms/pages/replenishment-register/` — **full page, not a dialog** (the import flow is
  too big): destination warehouse select → file upload (`.xlsx`/`.csv`/`.txt`, template
  download link) → `POST /replenishments/parse` → editable preview table with per-row
  validation errors (fix inline or re-upload) → evidence photos uploader (multi-image →
  R2, same pattern as report photos) → notes → confirm. Submit button disabled while any
  row error remains.
- `wms/pages/replenishment-view/` — read-only: items table, evidence photo gallery
  (lightbox via `<p-dialog>`), source file download link, link to the emitted movements
  (movements list pre-filtered by `replenishmentId`).
- `wms/components/reason-select/` — reusable form control (CVA) wrapping `<p-select>`:
  takes an applicability context (`inbound` / `transfer` / `readjustment_in` /
  `readjustment_out`), lists active reasons for it, and hosts an **"Add reason" button in
  the select's footer template** (rendered only for owner/admin via `hasRole`). Used by
  all three movement dialogs — never a raw `<p-select>` for reasons.
- `wms/components/add-reason-dialog/` — shape 3, opened from the `reason-select` footer:
  label + applicability checkboxes; code auto-slugged (shown read-only); on save,
  refreshes the reasons list and emits the new code so the triggering `reason-select`
  auto-selects it. Owner/admin only.
- `wms/components/inbound-dialog/` — **ad-hoc single-material receipts only** (e.g.
  `refund_by_client`, `repair` returns); serialized: textarea of serials, one per line;
  unserialized: quantity. Required `reason-select` (context `inbound`). Bulk restocking
  belongs to the replenishment flow — point users there when they pick `replenishment`
  here (or exclude it from this dialog's reasons; decide at build time).
- `wms/components/readjustment-dialog/` — owner/admin only: direction (in/out), material
  + qty or serialized units, location, required `reason-select` (context switches with
  the chosen direction) + **required free-text notes** (mirrors the delete-dialog
  audit-comment convention). This is the *only* way stock is corrected.
- `wms/components/transfer-dialog/` — move stock/units between warehouse/node pairs;
  the common case "load technician van" is this dialog with the target pre-set to the
  tech's warehouse. Required `reason-select` (defaults `relocation`). **Technician mode =
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
- `MaterialsState`: list/detail/stock/movements + `reasons` (loaded once, refreshed on
  create). Actions: CRUD + `LoadStock(materialId)`, `Inbound`, `Transfer`, `Readjust`,
  `LoadMovements(query)`, `LoadMovementReasons`, `CreateMovementReason`,
  `SetReasonActive(id, active)`.
- `ReplenishmentsState`: `list`, `total`, `selected`, `parsePreview` (rows + errors +
  fileKey). Actions: `LoadReplenishments(query)`, `LoadReplenishment(id)`,
  `ParseReplenishmentFile(file)`, `CreateReplenishment(payload)`.
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
- [ ] `reason-select` (applicability-filtered, footer "Add reason" for owner/admin) +
      `add-reason-dialog` (label + appliesTo, auto-slug, auto-select on save); wired
      into all three movement dialogs with per-dialog defaults
- [ ] Built-in special-case constants (`movement-reasons.ts`: `report_binding`,
      `relocation`); live reasons list from API via `LoadMovementReasons`
- [ ] Readjustment dialog (owner/admin, direction in/out, direction-legal reasons,
      required notes); no edit/delete affordance anywhere on movements
- [ ] Movements history on material view (type + reason tags shown, filterable by
      reason)
- [ ] Technician assignment dialog on warehouses list; read-only badge handshake with 03

### CP-5 — Replenishments
- [ ] `ReplenishmentsState` + DTOs; Replenishments tab (list + filters) in the WMS
      sub-nav
- [ ] Register page: warehouse select → file upload (.xlsx/.csv/.txt) + template
      download → parse preview with inline row fixes → confirm (submit disabled while
      row errors remain)
- [ ] Evidence photos: multi-image upload → R2 keys, gallery on the view page
- [ ] Replenishment view: items, evidence gallery, source file download, link to
      emitted movements (pre-filtered by `replenishmentId`)
- [ ] Manual pass: import a 10-row csv with 2 bad rows → fix inline → attach 2 photos →
      confirm → stock updated, movements show `replenishment` reason + link back

### CP-6 — Report material tracking + roles + polish
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
  corrections emit compensating readjustments server-side, and `type` ↔ reason
  validation driven by each reason's `appliesTo` (built-in seeds per §1 table).
- ~~Reason semantics~~ — **confirmed 2026-07-05:** `refund_by_client` = client returns
  material to us (in); `refund_to_provider` = we send it back for money back (out);
  `return_to_provider` = exchange/replacement expected (out).
- Replenishment import: backend parses `.xlsx` in the Worker (SheetJS works on Workers;
  files are small stock lists) — confirm no CPU-limit issue with the backend agent.
  Template column set (`sku`, `quantity`, `serial`) to validate with real provider lists.
- Inbound dialog: hide `replenishment` from its reasons vs redirect hint to the
  replenishment flow — decide at build time (see §3).
- Nesting depth: one level of sub-warehouses enough for v1?
- Can a **sub-warehouse** be the technician-assigned one (van as sub of main)? Assumed yes.
- Tracking-mode immutability after first movement — backend rule, confirm.
- Serialized consumption on report: mark `consumed` vs transfer to a virtual "consumed"
  location — backend decision, UI shows status either way.
- Ask to 03: user detail shows assigned warehouse read-only (link to warehouse view).
