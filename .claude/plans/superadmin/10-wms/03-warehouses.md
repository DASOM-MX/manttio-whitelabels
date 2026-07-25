# 10-wms / 03 — Warehouses (frontend)

> **Status:** not-started · **Depends on:** 01/02 (shapes; mockable), shell (done)
> **Owner:** — · **Last updated:** 2026-07-19

First frontend slice: the warehouse registry — root warehouses, one level of
sub-warehouses, and technician (van) assignment. Owns the staff landing page of the
Almacén area and the `wms.routes.ts` real routing table (replacing the `ModuleStub`
rows — keep the technician `''`/`stock` stub records alive until 09 replaces them).

**Roles:** structure + assignment owner/admin; office views the list read-only
(operational role needs to see where stock lives); technician never routes here
(their `''` is `my-warehouse`, 09). Route `data` per overview §4.

---

## 1. DTOs (`app/data/dtos/wms/warehouse.dto.ts` — sync with 01 §2)

```
Warehouse {
  id, name,
  type: 'warehouse' | 'sub-warehouse',    // derived server-side, present in responses
  parentId?, assignedTechnician?: { id, name },
  address?, notes?, createdAt
}
WarehouseTreeNode = Warehouse + { children: Warehouse[],
                                  stockSummary: { materialCount, unitCount } }
```

## 2. Page — `wms/pages/warehouses-list/`

- **Table of root warehouses, expandable to sub-warehouses** (`<p-table>` with row
  expansion — no lazy paging: warehouse counts are small; still rides
  `ListQueryService` for the `search` param so the URL stays shareable). Loaded from
  `GET /warehouses/tree` via `WarehousesState`.
- Columns: name (+ sub-warehouse indent/chevron on expansion rows), type pill
  (Almacén / Subalmacén), **technician badge** when assigned (person icon + name — the
  van marker), material/unit counts from `stockSummary`, address (truncated), created.
- **Row click → `warehouse-view`** (`/warehouse/:id`, row-click pattern per overview
  §3); action cell stops propagation.
- Actions (owner/admin only, `hasRole` — hidden, never disabled): add warehouse
  (header button), add sub-warehouse (row action on roots), edit, assign technician,
  delete. Office renders the pure table.
- Empty state: warehouse icon + "Sin almacenes" + create action (owner/admin).

## 3. Dialogs (`wms/components/`)

- **`warehouse-form-dialog/`** — shape 3 (owns form + dispatch + toasts), imperative
  `open(warehouse?, parent?)`: create root, create sub (parent pre-locked, shown as a
  read-only display row — never a disabled input), edit. Fields: name (required),
  parent (`<p-select>` of roots only, omitted when editing a root with children),
  address, notes. `h-12` controls, dialog width idiom + `max-w-11/12`.
- **`assign-technician-dialog/`** — shape 3, `open(warehouse)`: single `<p-select>` of
  technicians (from 05's users lookup — reuse `UsersState`/service, **don't rebuild a
  user fetch**), current assignee pre-selected, "Quitar asignación" secondary action
  sends `userId: null`. Surfaces `409 technician_already_assigned` as an inline error
  naming the conflict ("Ya tiene asignado <almacén>" — error-clarity rule).
- **Delete** — `ConfirmationService` confirm (shape 1) is enough: the backend enforces
  empty-only; `409 warehouse_not_empty` toast explains ("Vacía el almacén antes de
  eliminarlo"). No audit comment on warehouses (movements are the audit).

## 4. State + service

`WarehousesState` (`src/state/warehouses/`) + `warehouses.service.ts`
(`app/services/http/`) — shapes and action catalog in `10-state-services-dtos.md` §1/§2.
This slice implements: `LoadWarehouseTree`, `CreateWarehouse`, `UpdateWarehouse`,
`DeleteWarehouse`, `AssignTechnician`. Register the state lazily in `wms.routes.ts`
(`provideStates`).

## 5. Cross-module handshake

- **05 users:** user detail renders the assigned warehouse read-only with a link to
  `/warehouse/:id` (ask already recorded in 05). The write path lives only here.
- Technician badge data comes from the tree payload — don't fetch users per row.

## 6. Testing

- e2e (`e2e/` Playwright pattern — seeded `auth.token`, `page.route` stubs, running
  `ng serve`): tree renders roots + expanded subs; owner sees actions, office doesn't;
  create sub → parent locked; assign → badge appears; 409 paths toast.
- Manual pass: create root → sub → assign technician → badge + 05 user-detail link →
  delete empty sub → delete-blocked on non-empty (after 06 exists).

---

## Checkpoints

### CP-1 — Registry
- [ ] DTOs + `warehouses.service.ts` + `WarehousesState` (lazy) wired
- [ ] `wms.routes.ts` real table per overview §4 (stub rows for 09 kept); staff nav
      children (Almacenes/Materiales/Reabastecimientos) added to the Almacén entry
- [ ] Warehouses list: expandable tree table, type pills, stock summary, search param
      via `ListQueryService`, row-click through, empty state, office read-only
- [ ] Form dialog (root/sub/edit) + delete confirm with 409 handling; build green

### CP-2 — Technician assignment
- [ ] Assign dialog (05 lookup reuse, unassign, conflict inline error)
- [ ] Badge on list + tree payload; dark-mode audit; e2e specs green

## Open decisions / asks
- Sub-warehouse creation from the warehouse-view header too (04) — nice-to-have, decide
  when 04 builds its header actions.
- Tree endpoint payload: `stockSummary` costs a join — if it drags, make it optional
  (`?summary=1`) and lazy-load. Backend call at 02 CP-1.
