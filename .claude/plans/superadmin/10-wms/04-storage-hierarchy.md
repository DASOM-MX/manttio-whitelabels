# 10-wms / 04 — Storage hierarchy (frontend)

> **Status:** not-started · **Depends on:** 03 (CP-1)
> **Owner:** — · **Last updated:** 2026-07-19

The inside-a-warehouse structure: `warehouse-view` with the `<p-tree>` of storage nodes
(unit → rack → section → box, adjacency list, one entity — 01 §2) and the stock panel
for the selected location. Structure mutations owner/admin; office read-only;
technicians reach this page only for **their own van** (route reuse — 09 wires that,
this slice just never hardcodes staff-only assumptions into the page).

---

## 1. DTOs (`app/data/dtos/wms/storage-node.dto.ts`)

```
StorageNode { id, warehouseId, parentNodeId?, type: StorageNodeType,
              name, hasChildren, createdAt }
StorageNodeType = 'storage_unit' | 'rack' | 'section' | 'storage_box'
LocationStock { entries: { material: MaterialRef, quantity }[],
                units: { id, serialNumber, material: MaterialRef, status }[] }
MaterialRef { id, name, sku?, unit, tracking }
```

Type labels/icons: `model/constants/wms/storage-node-type-labels.const.ts`
(Unidad de almacenamiento / Rack / Sección / Caja) +
`storage-node-type-rank.const.ts` (mirror of backend `STORAGE_NODE_RANK` — drives the
legal-parent filtering; keep the two in sync). Rendered via a pure pipe
(`app/pipes/storage-node-type-label.pipe.ts`) — no method calls in templates.

## 2. Page — `wms/pages/warehouse-view/` (`/warehouse/:id`)

Layout: header card + two-pane body (tree left, stock panel right; stacks on mobile —
tree first, panel folds below).

- **Header card:** name + type pill, parent link (subs), technician badge (link to the
  user in 05), address/notes, created. Owner/admin actions: edit (03's form dialog),
  assign technician (03's dialog), add sub-warehouse (roots), delete-if-empty.
  Sub-warehouses of this root list as chips linking to their own views.
- **`<p-tree>` of storage nodes** — lazy children via
  `GET /warehouses/:id/nodes?parentNodeId=` (`hasChildren` drives the expander), node
  template: type icon + name + child count. Selection drives the stock panel.
  Node **context actions** (owner/admin, popover per node): add child (offers **only
  legal types** — rank strictly greater than the node's, per the rank const; root add
  offers all four types per overview proposal 11), rename, delete-if-empty.
- **Stock panel** (right): stock at the selected node — or warehouse-level totals when
  nothing is selected (`GET /warehouses/:id/stock?nodeId=`). Unserialized table
  (material, qty + unit) and serialized units (serial, material, status pill). Rows
  link to `material-view` (05). Empty state per location ("Sin existencias aquí").

## 3. Dialogs

- **`storage-node-form-dialog/`** — shape 3, `open(warehouseId, parent?, node?)`:
  name (required) + type `<p-select>` filtered to legal types for the parent (create
  only — **type renders as a display row when editing**, it's immutable). Parent shown
  as a read-only breadcrumb row. `409 duplicate_node_name` → inline field error.
- **Delete node** — shape-1 confirm; `409 node_not_empty` toast ("Mueve o consume las
  existencias del nodo antes de eliminarlo").

## 4. State

Extends `WarehousesState`: `selected` (warehouse detail), `nodes` subtree cache keyed by
`parentNodeId` (invalidate the parent's entry on create/rename/delete), `locationStock`.
Actions: `LoadWarehouse(id)`, `LoadNodes(warehouseId, parentNodeId?)`,
`CreateNode`, `RenameNode`, `DeleteNode`, `LoadLocationStock(warehouseId, nodeId?)`.

## 5. Testing

- e2e: lazy expansion; add-child menu offers only legal types at each level (unit →
  rack/section/box; section → box only; box → none); rename in place; node selection
  swaps the stock panel; office sees no context actions.
- Manual pass: unit → rack → section → box chain; box directly under unit; delete
  blocked on populated node (post-06); dark mode both panes.

---

## Checkpoints

### CP-1 — Warehouse view + tree
- [ ] DTOs + state extensions + service methods
- [ ] Page: header card (03 dialog reuse), lazy `<p-tree>`, legal-type node form
      dialog, rename, delete-if-empty, duplicate-name inline error
- [ ] Stock panel bound to selection (warehouse totals default), links to material-view
      (plain route strings until 05 lands — coordinate, don't block)
- [ ] Office read-only verified; empty/loading skeletons; build green; e2e specs

## Open decisions / asks
- Node **move** (re-parent) stays out of v1 (01 §2) — revisit if real usage asks;
  delete-if-empty + recreate is the workaround.
- Tree drag-drop reorder: out of v1 (nodes are unordered; alphabetical sort). Flag if a
  tenant wants manual ordering.
- Root-nodes-any-type (overview proposal 11) — confirm before building the root add
  menu; fallback is roots = `storage_unit` only (one-line change in the legal-type
  helper).
