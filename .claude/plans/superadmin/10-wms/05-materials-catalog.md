# 10-wms / 05 — Materials catalog (frontend)

> **Status:** not-started · **Depends on:** 03 (CP-1; parallel with 04)
> **Owner:** — · **Last updated:** 2026-07-19

The material catalog (SKUs) and the per-material detail view with its stock breakdown.
Catalog mutations owner/admin; office + technician read (the technician read *is* the
stock-lookup surface — 09 reuses these pages with actions hidden; build them so that
works: every action behind `hasRole`, no staff-only assumptions in data loading).

---

## 1. DTOs (`app/data/dtos/wms/material.dto.ts`, `material-unit.dto.ts`)

```
Material { id, sku?, upc?, name, description?, unit, tracking: MaterialTracking,
           minStock?, totalStock, lowStock: boolean, createdAt }
           // sku = internal code · upc = scanned barcode (GTIN digits — added 2026-07-19)
MaterialTracking = 'serialized' | 'lot' | 'unserialized'   // lot added 2026-07-20:
                                                  // batch consumables (clavos,
                                                  // remaches, rondanas)
MaterialStock { entries: { warehouse: { id, name }, node?: { id, name },
                           quantity }[],
                units: MaterialUnit[],           // serialized only
                lots: { lotNumber, warehouse: { id, name },
                        node?: { id, name }, quantity,
                        expiresAt? }[] }                        // lot only (expiresAt
                                                              // present if tracked)
MaterialUnit { id, serialNumber, warehouse: { id, name }, node?: { id, name },
               status: MaterialUnitStatus }
MaterialUnitStatus = 'in_stock' | 'assigned' | 'consumed' | 'lost'
MaterialsQuery { search?, tracking?, lowStock?, page, limit }
```

Constants (`model/constants/wms/`): `material-tracking-labels.const.ts`
(Serializado / Por lote / A granel), `material-unit-status-labels.const.ts` +
`material-unit-status-pill-classes.const.ts` (in_stock emerald · assigned sky ·
consumed granite · lost red — label always rides the color),
`material-unit-suggestions.const.ts` (curated unit suggestions: pza, m, kg, l, rollo,
caja, jgo, …). Pipes for tracking/status rendering in `app/pipes/`.

## 2. Page — `wms/pages/materials-list/` (`/warehouse/materials`)

- Lazy `<p-table>` against `GET /materials` via `ListQueryService` — params `search`,
  `tracking`, `lowStock`, `page` (sanitize: `keyIn` whitelist on tracking, boolean
  coerce on lowStock, clamp page).
- Columns: sku (font-data), upc (font-data, hidden `<lg` — codes fold before names),
  name, tracking pill, unit, **total stock** (tabular numerals) with **low-stock
  pill** when `lowStock` ("Bajo mínimo" — amber), created.
- Filters row: search input (matches name/SKU/UPC server-side — a keyboard-wedge
  **barcode scan into this box resolves the material**; scanners type digits + Enter,
  so no dedicated scan UI is needed), tracking `<p-select>`, low-stock toggle.
- Row click → `material-view`; actions (owner/admin): new material (header), edit,
  delete (confirm; `409 material_has_stock` toast). Office/technician: pure table.
- Empty state + skeleton rows.

## 3. Dialog — `wms/components/material-form-dialog/`

Shape 3, `open(material?)`. Fields: name (required), sku, **upc** (optional; digits
8–14, `inputmode="numeric"`; helper "Código de barras (UPC/EAN) — puedes escanearlo
aquí"; `409 upc_in_use` → inline field error), description, unit (required —
free text input with the curated suggestions as a datalist-style autocomplete; never a
closed select), **tracking** (required; radio trio with helper text per mode —
serializado: pieza por pieza con número de serie · por lote: consumibles por
lote/caja, cantidad dentro de cada lote · a granel: solo cantidad), minStock
(`<p-inputnumber>`, optional). **Tracking is immutable after create** (01 §2 — backend rejects once
movements exist): on edit it renders as a display row with the pill, not a control
(never a disabled input). `409 sku_in_use` → inline field error.

## 4. Page — `wms/pages/material-view/` (`/warehouse/materials/:id`)

- **Header card:** name, sku, upc (font-data), tracking pill, unit, description,
  minStock, total stock (big stat, `font-data`), low-stock pill. Owner/admin: edit
  (dialog), delete.
- **Stock by location** (`GET /materials/:id/stock`): table warehouse → node → quantity;
  warehouse cells link to `warehouse-view`. Serialized: the **units table** instead —
  serial (font-data), location, status pill; filter chips by status; count summary
  ("12 en stock · 3 consumidas · 1 perdida"). Lot: the **lots table** instead —
  lot number (font-data), location, remaining quantity, **expiry when tracked**
  (`expiresAt` → date + a "Vencido" / "Por vencer" pill when past / within 30 days —
  `lot-expiry-pill.pipe.ts`); rows sort by soonest expiry then lot number;
  zero-balance lots fold behind a "Mostrar lotes agotados" toggle.
- **Movements history** section below — mounts 06's `movements-table` component
  pre-filtered `materialId` (renders a placeholder marker until 06 lands; leave the
  slot clearly commented, don't build movement UI here).
- Stock-operation entry points (owner/admin/office; hidden for technician — 09):
  "Entrada" / "Traslado" / "Ajuste" buttons opening 06's dialogs with the material
  pre-selected (wire as no-ops behind a feature comment until 06 lands).

## 5. State + service

`MaterialsState` (`src/state/materials/`) + `materials.service.ts`: `list`, `total`,
`loading`, `selected`, `stock`. Actions: `LoadMaterials(query)`, `LoadMaterial(id)`,
`LoadMaterialStock(id)`, `CreateMaterial`, `UpdateMaterial`, `DeleteMaterial`.
Movements/reasons state belongs to 06 (`StockState`) — don't fold it in here
(supersedes the original file's single-state sketch; overview proposal 9).

## 6. Testing

- e2e: list filters round-trip through the URL (reload restores); scanner-style search
  (paste 13 digits + Enter → material found by upc); tracking immutability (edit shows
  display row); low-stock pill logic; unit suggestions accept free text; role sweep
  (office sees no mutations).
- Manual pass: create serialized + unserialized materials → both appear with correct
  pills → minStock triggers the low-stock pill once stock exists (post-06 revisit).

---

## Checkpoints

### CP-1 — Catalog
- [ ] DTOs + `materials.service.ts` + `MaterialsState` (lazy in `wms.routes.ts`)
- [ ] Materials list: lazy table + URL-persisted filters + pills + row-click + empty
      state; office/tech read-only
- [ ] Form dialog (unit suggestions, tracking radio + post-create display row, sku
      inline 409); delete confirm; build green

### CP-2 — Material view
- [ ] Header card + per-location stock table + serialized units table with status
      filter chips + **lot table (lot number, location, remaining; agotados toggle)**
- [ ] Movements slot marked for 06; stock-op entry buttons stubbed behind `hasRole`
- [ ] 11-equipment handshake: this page is the link target for
      `Equipment.materialUnitId` — expose a unit anchor (`/warehouse/materials/:id`
      + `?unit=` highlight) and tell 11's owner to flip their plain-id rendering
      (11 CP-3 item)
- [ ] Dark mode, skeletons, e2e specs; build green

## Open decisions / asks
- Unit suggestions list contents — seed from real tenant vocabulary when available;
  keep the const small (≤10) until then.
- `?unit=` highlight anchor shape (CP-2) — agree with 11's owner before they wire the
  link.
- Should the units table paginate? Spec: client-side up to 200 units, flag if a real
  tenant exceeds it.
