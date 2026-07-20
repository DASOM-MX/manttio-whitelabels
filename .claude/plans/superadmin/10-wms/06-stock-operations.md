# 10-wms / 06 — Stock operations (frontend)

> **Status:** not-started · **Depends on:** 04, 05
> **Owner:** — · **Last updated:** 2026-07-19

The movement layer: the three operation dialogs (inbound / transfer / readjustment),
the reason system (`reason-select` CVA + `add-reason-dialog`), and the movements
history table. Everything here writes through `POST /stock/*` and reads
`GET /movements` + `GET /movement-reasons` (02 §4/§5). **Movements are append-only —
this slice must ship zero edit/delete affordances, and no other slice may add one.**

**Roles:** inbound + transfer owner/admin/office; readjustment owner/admin only;
technician transfer = **self-checkout mode** (§5; entry point built in 09). Reason
management owner/admin.

---

## 1. DTOs (`app/data/dtos/wms/movement.dto.ts`, `movement-reason.dto.ts`)

```
Movement { id, type: MovementType, direction?: 'in' | 'out',
           reason: { code, label }, material: MaterialRef,
           quantity?, units?: { id, serialNumber }[],
           lotNumber?,                                  // lot-tracked movements (2026-07-20)
           from?: LocationRef, to?: LocationRef,        // { warehouse, node? } names
           reportId?, replenishmentId?, user: { id, name },
           notes?, createdAt }
MovementType = 'inbound' | 'transfer' | 'consumption' | 'readjustment'
MovementReason { id, code, label, builtIn, appliesTo: ReasonContext[], active }
ReasonContext = 'inbound' | 'transfer' | 'readjustment_in' | 'readjustment_out'
              | 'consumption'
MovementsQuery { materialId?, warehouseId?, nodeId?, reportId?, replenishmentId?,
                 type?, reason?, from?, to?, page, limit }
```

Constants: `model/constants/wms/movement-type-labels.const.ts` (Entrada / Traslado /
Consumo / Ajuste) + `movement-type-pill-classes.const.ts` (inbound emerald · transfer
sky · consumption navy · readjustment amber) +
**`special-reason-codes.const.ts`** — the only reason codes the UI special-cases:
`report_binding` (auto-set, never selectable), `relocation` (transfer/self-checkout
default), `replenishment` (excluded from ad-hoc inbound). The live list always comes
from the API (`LoadMovementReasons`) — never hardcode the other nine (incl.
`scrap`, added 2026-07-20).

## 2. Reason system

- **`wms/components/reason-select/`** — reusable **CVA** wrapping `<p-select>`:
  `context = input.required<ReasonContext>()`; options = active reasons whose
  `appliesTo` includes the context, minus `special-reason-codes` exclusions
  (computed over `StockState.reasons`). **Footer template hosts "Agregar motivo"**
  (owner/admin via `hasRole` — hidden otherwise) opening `add-reason-dialog`.
  Used by **all three dialogs — never a raw `<p-select>` for reasons anywhere.**
- **`wms/components/add-reason-dialog/`** — shape 3, opened from the footer: label
  (required) + applicability checkboxes (inbound / transfer / ajuste-entrada /
  ajuste-salida — `consumption` never offered), auto-slugged code preview rendered as
  a read-only display row. On save: dispatch `CreateMovementReason`, refresh, **emit
  the new code so the triggering `reason-select` auto-selects it**.
- **Reason administration** (deactivate/reactivate custom reasons, edit labels) —
  minimal v1: a "Motivos de movimiento" section reachable from the material-view
  movements filter area is **out**; instead, `PATCH` affordances live in a compact
  list inside `add-reason-dialog` ("Administrar" expander, owner/admin, custom reasons
  only: label inline-edit + active toggle). Built-ins render locked with a lock icon.

## 3. Operation dialogs (`wms/components/`)

All shape 3, all `open(prefill?)` (material and/or location pre-set from the calling
page), all with required `reason-select`, all submitting through `StockState` actions
with success toast + refresh of the affected views. The input mode switches on the
selected material's `tracking`: unserialized = quantity · serialized = serials/unit
picks · **lot = lot number + quantity** (2026-07-20). Material autocompletes hit
`GET /materials?search` which matches **name/SKU/UPC** (02 §3) — keyboard-wedge
barcode scanners work in every dialog with no dedicated scan UI.

- **`inbound-dialog/`** — ad-hoc single-material receipts (refund_by_client, repair
  returns…). Material autocomplete → destination (warehouse `<p-select>` → optional
  node cascade) → unserialized: quantity; serialized: **textarea of serials, one per
  line** (dup/existing serial errors surface per line after submit); lot: lot
  number input + quantity (creates/tops-up the lot at the destination). Reason context
  `inbound`, **`replenishment` excluded** with a hint row linking to
  `/warehouse/replenishments/new` ("¿Reabastecimiento masivo? Regístralo como
  documento") — resolves the original build-time decision (proposed 2026-07-19;
  backend rejects it too, 02 §4).
- **`transfer-dialog/`** — material → source (warehouse+node, only locations with
  stock of it) → destination (warehouse+node) → quantity (max = source balance,
  helper text shows it) | unit multiselect (units `in_stock` at source) | lot
  `<p-select>` (lots with balance at source, remaining shown) + quantity. Reason
  context `transfer`, **default `relocation`**. The common "cargar camioneta" case is
  this dialog with destination pre-set to a tech's van (entry point: 03's list row
  action on assigned warehouses). **Technician mode = self-checkout** (§5).
- **`readjustment-dialog/`** — owner/admin only: direction toggle (Entrada/Salida)
  which **switches the reason context** (`readjustment_in`/`readjustment_out`),
  material, location, quantity | unit multiselect | lot select + quantity, reason,
  **required free-text
  notes** (mirrors the delete-dialog audit-comment convention — helper text says the
  note lands permanently in the movement history). Confirm-heavy: submit label
  "Registrar ajuste", no undo (append-only — undo-support rule satisfied by the
  compensating-movement doctrine, not by deletion).

## 4. Movements history — `wms/components/movements-table/`

Reusable presentational table (also mounted by 05's material-view, 07's replenishment
view via `replenishmentId` filter, 09's my-warehouse):

- Inputs: a fixed base filter (`Partial<MovementsQuery>`) + which filter controls to
  show. Paged via `LoadMovements`; **URL-persisted filters only on pages where it is
  the primary content** (my-warehouse history tab — 09); embedded instances keep
  local-only paging (documented ListQueryService exception: one URL owner per page).
- Columns: date (font-data), type pill (+ direction arrow on readjustments), reason
  tag (inactive reasons render normally — history never hides), material,
  qty/serials/**lot tag** (font-data), from → to (warehouse/node names), user,
  report/replenishment links (route to 06's report-view / 07's view), notes
  (truncated, popover full text).
- Filterable by type + reason (+ date range where shown). **No row actions of any
  kind.**

## 5. Self-checkout (technician transfer mode)

`transfer-dialog` with `mode = 'self-checkout'`: destination rendered as a read-only
display row (their van — from `/auth/me` + warehouse lookup), source select excludes
other technicians' warehouses (the backend-filtered `GET /warehouses` list — 02 §2),
reason fixed `relocation` rendered as a display row (no select). Backend enforces all
three (02 §4) — the UI locking is UX, not security. Entry point + page context: 09.

## 6. State + service

`StockState` (`src/state/stock/`) + `stock.service.ts`: `reasons` (loaded once on wms
route activation, refreshed on create/patch), `movements`, `movementsTotal`,
`loading`. Actions: `LoadMovementReasons`, `CreateMovementReason`,
`UpdateMovementReason(id, { label?, active? })`, `Inbound(payload)`,
`Transfer(payload)`, `Readjust(payload)`, `LoadMovements(query)`. After each
operation: refetch the material stock / location stock the calling page shows
(dispatch the owning state's load action — don't duplicate stock math client-side).

## 7. Testing

- e2e: reason-select filters by context and hides specials; add-reason auto-selects;
  the three dialogs submit correct payloads (assert via `page.route` capture);
  serialized/lot/unserialized input switch; readjustment requires notes; movements table
  renders all four types + links; **no edit/delete affordance exists** (assert
  absence).
- Manual pass (original CP-4): inbound 10 pza + 2 serials → transfer to van (preset)
  → readjust-out 1 damaged (unit flips lost) → history shows 4 movements with
  reasons, material view balances agree.

---

## Checkpoints

### CP-1 — Reason system
- [ ] DTOs + `StockState` + `stock.service.ts` (lazy); `LoadMovementReasons` on area
      activation; special-codes const
- [ ] `reason-select` CVA (context filtering, footer add — owner/admin) +
      `add-reason-dialog` (auto-slug preview, auto-select on save, admin expander
      with label edit + active toggle, built-ins locked)

### CP-2 — Operation dialogs
- [ ] Inbound dialog (all three modes incl. lot number + qty, serials textarea,
      replenishment exclusion + hint)
- [ ] Transfer dialog (stock-aware source/destination, lot select + qty, balance
      helper, `relocation` default, van preset entry from 03)
- [ ] Readjustment dialog (direction-switched context, required notes, owner/admin
      gate); entry buttons on material-view (05 CP-2 stubs) wired live

### CP-3 — Movements history
- [ ] `movements-table` (base-filter input, type/reason filters, links, zero actions)
      mounted on material-view; build green; e2e + manual pass

## Open decisions / asks
- Reason admin placement (§2 — inside add-reason-dialog vs a dedicated settings page):
  spec'd minimal; escalate to a page only if reason lists grow.
- Transfer of `consumed`/`lost` units is impossible by construction (source lists
  `in_stock` only) — confirm no recovery flow is needed beyond readjustment-in (01 §4).
- Whether office may use the van-preset transfer entry (yes per §2.1 — van loading is
  office work); verify the 03 row action isn't owner/admin-gated by mistake.
