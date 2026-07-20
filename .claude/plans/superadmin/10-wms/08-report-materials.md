# 10-wms / 08 — Report material tracking (frontend)

> **Status:** not-started · **Depends on:** 06; backend 02 CP-3; 06-reports slot (done)
> **Owner:** — · **Last updated:** 2026-07-19

The bridge between reports and stock: `report-materials-editor` fills the **reserved
materials slot in 06-reports' `report-view`** (slot markers shipped with reports CP-2).
Owned by this module's agent, lives under `wms/`, imported by the report view. A report
MAY have zero materials — the empty slot renders a quiet empty state, never blocks the
report flow.

**Roles (`../14-access-control.md` §2.1b — binding):** technician adds/edits on **their
own reports**, sourced from **their own van only**, while the report is still editable
(`created`/`in-progress`); owner/admin edit any report's materials, any source, any
status (that's the correction path); **office renders the block read-only.** Backend
enforces all of it (02 §7) — the UI mirrors.

---

## 1. DTOs (`app/data/dtos/wms/report-material.dto.ts`)

```
ReportMaterial { id, material: MaterialRef,
                 quantity?,                        // unserialized + lot
                 unit?: { id, serialNumber },      // serialized
                 lotNumber?,                        // lot (2026-07-20) — qty from a lot
                 sourceWarehouse: { id, name } }
SaveReportMaterialsPayload { items: { materialId,
                                      quantity? | materialUnitId? | (lotNumber + quantity),
                                      sourceWarehouseId }[] }
```

## 2. Component — `wms/components/report-materials-editor/`

Mounted by `reports/pages/report-view/` in its reserved slot (coordinate the import
with 06-reports' owner — one-line mount, slot already marked):

- Inputs: `reportId`, `reportTechnicianId`, `reportStatus`; the component derives its
  own mode from `AuthState` + those inputs (editable / read-only) via computed signals
  — **no forked variants** for roles.
- **Read view** (everyone): compact table — material (name + sku), tracking pill,
  qty + unit | serial (font-data), source warehouse. Sum row when >1 unserialized row
  of the same unit type is pointless — skip totals, this is a picking list.
- **Edit mode** (per role rules): add-row picker — material autocomplete → by
  tracking: quantity input (helper shows available balance at the chosen source) |
  unit select (units `in_stock` at the source) | **lot select (van's lots with
  balance, remaining shown) + quantity** (2026-07-20 — a technician consumes N
  washers from a specific lot); **source warehouse select defaults to
  the report technician's van** (from the warehouses list; technician mode: locked to
  own van, rendered as a display row). Row remove (trash icon). **Save dispatches the
  full list** (`PUT` replace-set) — the editor is a small local form array, dirty
  tracking + "Guardar materiales" button, not row-by-row autosave.
- Correction UX (owner/admin on finished/mailed reports): same editor; a subtle notice
  line explains edits emit compensating movements to the history ("Las correcciones
  quedan registradas como ajustes") — no special "correction mode".
- After save: refetch the list + toast; if the mounting report view shows a
  material-consumption summary anywhere later, it reads from this state.

## 3. What the backend does with a save (spec'd here so the UI never fakes it)

`PUT /reports/:id/materials` diffs current vs incoming (02 §7) and emits, all under
reason **`report_binding`** (auto-set — never user-selectable; its seed `appliesTo`
extended to readjustments for exactly this, proposed 2026-07-19 — 01 §5):

- addition → `consumption` movement (−source; serialized: unit → `consumed`; lot:
  −qty from that `lot_number` at source), `reportId` set;
- removal / quantity decrease → compensating `readjustment` (direction `in`, +back at
  the recorded source; serialized: unit back to `in_stock`; lot: +qty back onto the
  lot);
- quantity increase → additional `consumption` for the delta.

The original consumption movements **stand** — history shows the mistake and the
correction (immutability doctrine). The UI never computes stock effects; it refreshes.

## 4. State + service

`ReportMaterialsState` (small — `src/state/report-materials/`) +
`report-materials.service.ts`: `byReport: Record<reportId, ReportMaterial[]>`,
`loading`, `saving`. Actions: `LoadReportMaterials(reportId)`,
`SaveReportMaterials(reportId, payload)`. **Registered in both route areas** — the wms
routes AND the reports route area (the editor mounts inside `/reports/:id`) — note in
`10-state-services-dtos.md` §1.

## 5. Equipment hook (coordinate — never build 11's side)

When a **serialized** unit is consumed on an install report, the backend
offers/auto-creates the client `Equipment` record (`materialUnitId` backlink — 11 §1).
Frontend impact here is zero in v1 (the hook is backend-emitted); just confirm with
11's owner whether the editor should surface a post-save hint ("Equipo creado a partir
de la serie …") once the hook lands. Record the outcome in both files.

## 6. Testing

- e2e: technician on own editable report — add unserialized + serialized rows, source
  locked to van; technician on finished report — read-only; office — read-only;
  owner on mailed report — editable with correction notice; save payload asserted;
  balance helper reflects source choice.
- Manual pass (part of original CP-6): tech attaches 2 pza + 1 serial from van → stock
  decremented, movements show consumption with report link → admin removes the serial
  row → compensating readjustment-in appears, unit back `in_stock`.

---

## Checkpoints

### CP-1 — Editor
- [ ] DTOs + service + `ReportMaterialsState` (dual-area registration)
- [ ] Editor component: read view, role-derived modes, add-row picker with tracking
      switch + balance helper + van defaulting/locking, replace-set save, empty state
- [ ] Mounted in report-view's slot (one-line PR to reports area, coordinated)

### CP-2 — Corrections + polish
- [ ] Owner/admin correction path verified end-to-end against backend compensations
      (movement history reads right); correction notice line
- [ ] Dark mode, skeletons; e2e specs; manual pass recorded; equipment-hook outcome
      noted (§5)

## Open decisions / asks
- Office correcting report materials stays **out** (owner/admin only) — revisit only
  per 14's open item once real correction traffic exists.
- Should the editor block saving when a source balance is insufficient, or let the
  backend 409 rule? Spec: pre-check as UX (disable + helper), backend remains
  authority; confirm the balance data is cheap enough (it rides the material stock
  read).
- Post-v1: a per-report "materials consumed" line on the report PDF — park with the
  PDF whitelabel work (pdf module seam), not here.
