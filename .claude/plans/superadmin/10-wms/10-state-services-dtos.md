# 10-wms / 10 — State, services, DTOs (frontend plumbing reference)

> **Status:** reference doc — kept current by whichever sub-plan agent touches the
> plumbing (same-commit rule) · **Last updated:** 2026-07-19

The single map of WMS frontend plumbing so five parallel agents don't collide: who owns
which state, service, DTO file, constant, and pipe. **Supersedes the original file's
§4** (two-state sketch + `src/http/` paths). File ownership = the sub-plan that lists
it; touching another slice's file means coordinating in its plan first.

---

## 1. NGXS states (`src/state/<resource>/` — state + actions files, no barrels)

| State | Owner | Shape (summary) | Actions |
|---|---|---|---|
| `WarehousesState` | 03/04 | `tree`, `flat` (selects), `selected`, `nodes` cache (by parent), `locationStock`, `loading` | `LoadWarehouseTree`, `LoadWarehouses`, `LoadWarehouse(id)`, `CreateWarehouse`, `UpdateWarehouse`, `DeleteWarehouse`, `AssignTechnician(id, userId \| null)`, `LoadNodes(wid, parentNodeId?)`, `CreateNode`, `RenameNode`, `DeleteNode`, `LoadLocationStock(wid, nodeId?)` |
| `MaterialsState` | 05 | `list`, `total`, `selected`, `stock`, `loading` | `LoadMaterials(query)`, `LoadMaterial(id)`, `LoadMaterialStock(id)`, `CreateMaterial`, `UpdateMaterial`, `DeleteMaterial` |
| `StockState` | 06 | `reasons`, `movements`, `movementsTotal`, `loading` | `LoadMovementReasons`, `CreateMovementReason`, `UpdateMovementReason`, `Inbound`, `Transfer`, `Readjust`, `LoadMovements(query)` |
| `ReplenishmentsState` | 07 | `list`, `total`, `selected`, `import` (active job — status/fields/progress/staged rows/prep/**submissionSnapshot**), `importAudit` (event log), `pendingImports` (list strip **+ shell approval banner**), `loading` | `LoadReplenishments(query)`, `LoadPendingImports`, `LoadReplenishment(id)`, `UploadImportFile(file)`, `SubmitImportMapping(importId, warehouseId, mapping)`, `ListenImportStatus(importId)` (**cancelUncompleted** fetch-SSE pipeline — 07 §3.1), `StopImportListening`, `DiscardImport(importId)`, `UpdatePreviewRow(line, patch)` (staged-row PATCH, audited), `RemoveStagedRow(line, reason)` (owner/admin, audited), `LoadImportAudit(importId)`, `UpdateImportPrep(importId, prep)`, `RejectImport(importId, comment)` (owner/admin), `ResubmitImport(importId)` (owner/admin/office), `CancelImport(importId, reason)` (**owner only**), `ApproveReplenishment(importId)` (owner/admin promotion) |
| `ReportMaterialsState` | 08 | `byReport`, `loading`, `saving` | `LoadReportMaterials(reportId)`, `SaveReportMaterials(reportId, payload)` |

- All registered **lazily** via `provideStates` in `wms.routes.ts`;
  `ReportMaterialsState` **additionally in the reports route area** (the editor mounts
  inside `/reports/:id` — 08 §4).
- `@Action` handlers are RxJS pipelines returning the observable (01-conventions) —
  never `async/await`; after stock-mutating actions, the *calling page's* load action
  refreshes balances (06 §6) — no client-side stock math, ever.
- Reads via top-level `select(...)`; `inject(Store)` only for dispatch.

## 2. HTTP services (`src/app/services/http/` — one per resource)

| Service | Owner | Wraps |
|---|---|---|
| `warehouses.service.ts` | 03/04 | `/warehouses` + nodes + tree + stock + assign (02 §2) |
| `materials.service.ts` | 05 | `/materials` (02 §3) |
| `stock.service.ts` | 06 | `/stock/*`, `/movements`, `/movement-reasons` (02 §4/§5) |
| `replenishments.service.ts` | 07 | `/replenishments` incl. multipart parse (02 §6) |
| `report-materials.service.ts` | 08 | `/reports/:id/materials` (02 §7) |

Use `toParams` from `app/data/utils.ts` for query DTOs; error surfacing via
`errorMessage` (reads `err.error.message` first — backend codes in 02 §9 all ship
human messages).

## 3. DTO files (`src/app/data/dtos/wms/` — one resource per file)

`warehouse.dto.ts` (03) · `storage-node.dto.ts` (04) · `material.dto.ts` +
`material-unit.dto.ts` (05) · `movement.dto.ts` + `movement-reason.dto.ts` (06) ·
`replenishment.dto.ts` (07 — `Replenishment` carries **`importId`**, the backlink
the view uses to load the audit) + `replenishment-import.dto.ts` (07 — incl.
`ImportEvent` + `ImportEventType` for the lifecycle audit) ·
`report-material.dto.ts` (08). Query
DTOs live with
their resource. Shared refs (`MaterialRef`, `LocationRef`) live in
`material.dto.ts` / `warehouse.dto.ts` respectively — import concrete files, no
barrel. String-literal unions mirror the backend enums (overview §3); keep in sync
with `01-data-model.md` §1.

## 4. Constants (`src/app/model/constants/wms/` — ONE constant per file)

| File | Owner |
|---|---|
| `storage-node-type-labels.const.ts` / `storage-node-type-rank.const.ts` | 04 |
| `material-tracking-labels.const.ts` (Serializado / Por lote / A granel) | 05 |
| `material-unit-status-labels.const.ts` / `material-unit-status-pill-classes.const.ts` | 05 |
| `material-unit-suggestions.const.ts` | 05 |
| `lot-expiry-thresholds.const.ts` (por-vencer window, default 30 days) | 05 |
| `movement-type-labels.const.ts` / `movement-type-pill-classes.const.ts` | 06 |
| `reason-context-labels.const.ts` | 06 |
| `special-reason-codes.const.ts` (`report_binding`, `relocation`, `replenishment`) | 06 |
| `parse-row-error-labels.const.ts` | 07 |
| `import-status-labels.const.ts` / `import-status-pill-classes.const.ts` (incl. `rejected` → "Cambios solicitados", `stale` → "Descartado", `cancelled` → "Cancelado") | 07 |
| `unprocessable-row-errors.const.ts` (serial-collision codes — mirror of backend `wms/constants/`) | 07 |
| `import-target-field-labels.const.ts` / `import-auto-map-patterns.const.ts` | 07 |
| `import-event-type-labels.const.ts` (lifecycle event → Spanish label; 14 events incl. `rejected`/`resubmitted`/`stale`/`cancelled`) | 07 |

## 5. Pipes (`src/app/pipes/` — pure, per-row template mappings)

`storage-node-type-label.pipe.ts` (04) · `material-tracking-label.pipe.ts`,
`material-unit-status-label.pipe.ts` + `-pill-class.pipe.ts` (05) ·
`lot-expiry-pill.pipe.ts` (05 — Vencido / Por vencer / null from `expiresAt`) ·
`movement-type-label.pipe.ts` + `-pill-class.pipe.ts` (06) ·
`parse-row-error-label.pipe.ts`, `import-status-label.pipe.ts` +
`-pill-class.pipe.ts` (07). Reuse `cast.pipe.ts` for form casts. No method calls in
templates.

## 6. Shared components inside `wms/`

`reason-select` + `add-reason-dialog` + `movements-table` (06 — consumed by 05/07/09) ·
the three operation dialogs (06) · `remove-staged-row-dialog` (07 — reason-required
staged-row removal) · `reject-import-dialog` (07 — owner/admin, **required comment**,
sends the import back to office) · `cancel-import-dialog` (07 — **owner only**,
**required reason**, full cancel → `cancelled`) · `import-audit-timeline` (07 — the whole-lifecycle audit,
consumed by the register approval-request **Historial tab** *and* the
`replenishment-view` details; keep it presentational, fed the `ImportEvent[]`) ·
`pending-replenishments-banner` (07 — the approval banner; lives in `wms/` but is
**mounted in the superadmin shell**, fed by `ReplenishmentsState.pendingImports`,
gated to the configured CMS-manager with an owner/admin fallback) ·
`report-materials-editor` + `expired-lot-warning-dialog`
(08 — consumed by the reports area). Nothing moves to
`src/app/shared/components/` unless a **non-wms**
second module needs it (master plan §2 rule 4).

## 7. Guards (`src/app/guards/`, one per file)

`technician-only.guard.ts` (09 — the dual-`''` matcher; staff record needs no new
guard, the central `accessGuard` + route roles cover it). Any new gate helper gets its
own file — no grab bags.
