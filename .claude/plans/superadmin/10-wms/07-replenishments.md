# 10-wms / 07 — Replenishments (frontend)

> **Status:** not-started · **Depends on:** 05, 06 (CP-1); backend 02 CP-3;
> 11 (processing service — required for the CP-3 manual pass, mockable before)
> **Owner:** — · **Last updated:** 2026-07-19

Bulk restocking as a first-class **document** (decided 2026-07-05): import a stock list
from a file, fix rows inline, attach evidence photos, confirm — the backend emits the
inbound movements (`reason: replenishment`, `replenishmentId` backlink). Owner/admin/
**office** (this is the office role's headline workflow). Documents are append-only:
no edit, no delete — corrections are readjustments (06).

**Import pipeline reworked 2026-07-19 (owner ask):** the fixed-template synchronous
parse is replaced by a **field-mapped asynchronous batch job** — upload the file →
the server detects its fields → the user maps them to our columns **in the app** →
the mapping is submitted and the standalone **processing service**
(`11-processing-service.md`) parses/validates → the page **polls the DB-backed
status** (`GET /replenishments/imports/:id` — 02 §6) until the preview is ready.
Any provider file works now; the downloadable template remains the zero-mapping
easy path (its headers auto-map exactly).

---

## 1. DTOs (`app/data/dtos/wms/replenishment.dto.ts`)

```
ReplenishmentSummary { id, folio, warehouse: { id, name }, itemCount,
                       evidenceCount, user: { id, name }, createdAt }
Replenishment = ReplenishmentSummary + {
  items: { material: MaterialRef, quantity?, serials?: string[],
           node?: { id, name } }[],
  evidencePhotos: string[],                  // CDN URLs, materialized server-side
  sourceFileUrl?, sourceFileName?, notes?
}
ReplenishmentImport {                       // dto for the async job (added 2026-07-19)
  id, status: ReplenishmentImportStatus, fileName,
  fields: ImportField[], mapping?: ImportMapping,
  progress: { total?, processed, errors }, error?,
  rows?: ParseRow[]                         // present once status = 'ready'
}
ImportField { id, header, samples: string[] }
ImportMapping { sku: string, quantity?: string, serial?: string }   // → field ids
ReplenishmentImportStatus = 'uploaded' | 'queued' | 'processing' | 'ready'
                          | 'failed' | 'confirmed' | 'discarded'
ParseRow { line, raw, materialId?, materialName?, tracking?,
           quantity?, serial?, error?: ParseRowError }
ParseRowError = 'unknown_sku' | 'bad_quantity' | 'missing_serial'
              | 'duplicate_serial' | 'serial_exists' | 'quantity_on_serialized'
ReplenishmentsQuery { warehouseId?, from?, to?, page, limit }
```

Row-error labels: `model/constants/wms/parse-row-error-labels.const.ts` (error-clarity
rule: cause + fix, e.g. `unknown_sku` → "SKU o UPC no encontrado — corrige el código o
crea el material"). Rendered via pipe. The `sku` file column accepts **SKU or UPC**
(02 §6 — provider lists and scan-built sheets usually carry the barcode).

## 2. Pages

### `wms/pages/replenishments-list/` (`/warehouse/replenishments`)

- Lazy `<p-table>` via `ListQueryService` (params `warehouseId`, `from`, `to`, `page`):
  folio (font-data, `#000123` style), warehouse, item count, evidence count (camera
  icon + n), registered by, date. Filters: warehouse select, date range.
- Row click → `replenishment-view`. Header action **"Registrar reabastecimiento"** →
  routes to `/warehouse/replenishments/new` (full page — the flow is too big for a
  dialog, decided 2026-07-05). Empty state with the same CTA.

### `wms/pages/replenishment-register/` (`/warehouse/replenishments/new`)

A **full page**, one column, progressive disclosure top-to-bottom (multi-step-progress
rules apply — this is a flow, keep back/cancel escape routes + dirty-navigation guard).
The active import's id persists as a **`?import=` query param** — reload/back returns
to the same job and resumes polling (URL-persistence rule applied to a flow).

1. **Destination** — warehouse `<p-select>` (required before the mapping submits;
   subs included).
2. **File** — upload card (`.xlsx`/`.csv`/`.txt`, 1 MB cap) + **template download
   links** (static assets `superadmin/public/templates/reabastecimiento.csv` + `.xlsx`
   — columns `sku,quantity,serial`; the `sku` column takes SKU **or UPC**; serialized =
   one row per unit, quantity 1). On pick → `UploadImportFile`
   (`POST /replenishments/imports`) — the file is **staged in R2** immediately (the
   reference the processing service pulls it by; **transient** — the processor purges
   the binary once it's fully processed, §4) and the response carries the **detected
   fields**. Re-upload discards the current import (`DiscardImport`,
   fire-and-forget) and starts a new one.
3. **Field mapper** (new 2026-07-19) — one row per detected file column: header
   (mono), sample-value chips (up to 5), and a target `<p-select>`: **Ignorar ·
   SKU / UPC · Cantidad · Serie**. Auto-mapped on arrival via header heuristics
   (`import-auto-map-patterns.const.ts`: `sku|c[oó]digo|clave|upc|ean` → sku ·
   `cant|qty|quantity|pzas?` → quantity · `serie|serial|s/n` → serial — first match
   wins, one target per column); user overrides freely. Validation mirrors the
   backend (`invalid_mapping`): SKU/UPC mapped + at least one of Cantidad/Serie —
   **"Procesar archivo"** stays disabled until valid, then dispatches
   `SubmitImportMapping` → 202.
4. **Processing panel** — replaces the mapper while the job runs: status pill
   (En cola / Procesando), `<p-progressbar>` off `progress.processed/total`
   (indeterminate until `total` is known), live counters ("128 / 300 filas · 4
   errores"), and the **polling loop** (§3.1). `failed` → error card with the
   stored `error`, retry = re-upload (escape route). Skeleton, not spinner.
5. **Preview table** — renders when `ready`, seeded from `rows`: line no., mapped
   source value, resolved material (name, tracking pill) or error pill,
   quantity/serial, **inline fixes**: code + quantity + serial cells editable
   (`pInputText`/`<p-inputnumber>`); an edit re-validates **client-side against
   loaded materials** for instant feedback and the whole set is re-validated
   server-side at confirm (02 §6 — the preview is UX, not trust). Error summary chip
   row above ("3 filas con errores") anchor-links to the first error (error-summary
   rule). Optional per-row node select (target location within the warehouse).
6. **Evidence photos** — multi-image uploader (same pattern as report photos: pick →
   `POST /upload` → keep R2 keys; thumbnails with remove). Delivery photos, invoices,
   pallets.
7. **Notes** — textarea, optional.
8. **Confirm** — summary strip (n items, m units/qty total, destination) + submit
   **disabled while any row error remains** or no items. `CreateReplenishment`
   (payload carries `importId` — 02 §6) → success → route to the new
   `replenishment-view`, toast with folio.

### `wms/pages/replenishment-view/` (`/warehouse/replenishments/:id`)

Read-only, forever: header card (folio, warehouse link, registered by, date, notes) ·
items table (material, tracking pill, qty | serials chips, node) · **evidence gallery**
(thumbnail grid → lightbox via `<p-dialog>`, same idiom as report photos) ·
source-file **name** (file icon + name, metadata only — the binary was purged after
processing; the imported rows themselves are the durable record) ·
**"Ver movimientos"** link → the movements view
pre-filtered by `replenishmentId` (mounts 06's `movements-table` in an expandable
section right on this page — no separate route needed).

## 3. State + service

`ReplenishmentsState` (`src/state/replenishments/`) + `replenishments.service.ts`:
`list`, `total`, `selected`, `import` (the active `ReplenishmentImport` — status,
fields, progress, rows), `previewRows` (the editable copy of `import.rows`),
`loading`. Actions: `LoadReplenishments(query)`, `LoadReplenishment(id)`,
`UploadImportFile(file)`, `SubmitImportMapping(importId, warehouseId, mapping)`,
`PollImport(importId)`, `StopImportPolling`, `DiscardImport(importId)`,
`UpdatePreviewRow(line, patch)` (pure state edit + client-side revalidation),
`CreateReplenishment(payload)`.

### 3.1 Polling logic (the microservice contract, frontend half)

The status truth is the **database row** — the page never assumes the processor is
near the API. `PollImport` is one RxJS pipeline (01-conventions: no `async/await` in
actions): `timer(0, 2500).pipe(switchMap(() => svc.getImport(id)), tap(patch state),
takeWhile(s => s.status === 'queued' || s.status === 'processing', true))` — emits
through the terminal state inclusively, then completes. Rules:

- **One poller at a time** — `@Action(PollImport, { cancelUncompleted: true })`;
  `StopImportPolling` (dispatched on route leave via `DestroyRef`) cancels outright.
- **Resume from URL:** the register page reads `?import=` on init and dispatches
  `PollImport` if the stored/loaded status is non-terminal — reload, back-nav, or a
  shared link all land back on the live progress panel.
- Interval 2.5 s flat (jobs finish in seconds; no backoff needed at these sizes) —
  revisit only if the processor ever handles multi-minute jobs.
- A poll error (network blip) does **not** kill the loop — `catchError` keeps the
  previous state and lets the next tick retry; only a 404/403 stops with a toast.

## 4. Storage (backend ask — proposed 2026-07-19)

Dedicated **`manttio-wms` R2 bucket**, CDN-fronted with its own base env (the
`manttio-equipment` precedent), holding two very different lifecycles:

- **`imports/<key>` — transient** (owner 2026-07-19): the staged source file exists
  only from upload until the processing service finishes with it — the processor
  purges the binary after the `ready` write and stamps `file_deleted_at` (01 §4,
  11 §3). Space stays flat no matter how many imports run.
- **`evidence/<key>` — permanent**: delivery photos, invoices, pallets — the human
  evidence on the confirmed document; never purged.

Upload path: extend the existing upload module with the wms target (02 §8). Until the
bucket exists, dev can point at the reports bucket behind the same service seam —
**don't let the seam leak into components** (only `replenishments.service.ts` +
backend know where files live).

## 5. Testing

- e2e (`page.route` stubs — the polling endpoint is stubbed as a **scripted status
  sequence** `queued → processing(2) → ready`): upload → mapper renders detected
  fields + samples; auto-map picks the template headers; mapping validation gates the
  submit; processing panel ticks progress off the stubbed sequence; `failed` path
  shows the error card; **reload mid-processing resumes polling from `?import=`**;
  preview renders all six error kinds with labels; inline fix clears an error
  client-side; confirm stays disabled until clean; evidence add/remove; confirm
  payload (with `importId`) asserted; view renders gallery + movements filter link;
  office can do everything here, technician can't route in.
- **Manual pass (original CP-5, binding — needs the processing service running,
  11 CP-3):** import a 10-row csv with 2 bad rows and non-template headers → map
  fields → watch queued/processing → fix rows inline → attach 2 photos → confirm →
  stock updated (material view), movements show `replenishment` reason + link back
  to the folio; xlsx + txt variants; 1 MB+ file rejected cleanly; kill the service
  mid-job → lease expiry retry completes it (11 §3).

---

## Checkpoints

### CP-1 — List + state
- [ ] DTOs + `replenishments.service.ts` + `ReplenishmentsState` (lazy)
- [ ] Replenishments list with URL-persisted filters, folio format, row-click, CTA
      empty state; build green

### CP-2 — Import: upload → mapper → processing
- [ ] Template assets in `public/templates/` (csv + xlsx, documented columns)
- [ ] Upload card (formats, cap, archive-on-upload; re-upload discards the prior
      import); import DTOs + upload/mapping/poll/discard actions
- [ ] Field mapper: detected columns + sample chips, target selects, auto-map
      heuristics const, backend-mirrored validation gating "Procesar archivo"
- [ ] Processing panel + polling loop per §3.1 (cancelUncompleted, route-leave stop,
      `?import=` resume, failed card, poll-error resilience); dirty-navigation guard

### CP-3 — Preview → confirm + view
- [ ] Preview seeded from import rows: six error kinds, inline fixes with client-side
      revalidation, error summary anchors, per-row node select
- [ ] Evidence uploader (multi-image → R2 keys, thumbnails, remove); notes; confirm
      gating + `importId` payload
- [ ] Replenishment view: items, gallery lightbox, source-file name metadata (via
      import join), `movements-table` expandable filtered by `replenishmentId`
- [ ] Dark mode + skeletons + empty states; e2e specs; **manual pass above recorded
      here with date**

## Open decisions / asks
- ~~SheetJS-on-Workers CPU check~~ — **retired 2026-07-19**: parsing lives in the
  processing service (11); the Worker only detects fields.
- Auto-map heuristics (§2 step 3) — validate the patterns against real provider
  lists before CP-2 closes (supersedes the old fixed-template column validation,
  master plan §5.2 item).
- **Mapping presets:** prefill the mapper from the tenant's last confirmed import
  when the detected headers match — cheap UX win, v1.1; decide at CP-2.
- Per-row node select in the preview (§2 step 5) — ship v1 or defer? Spec: ship (the
  backend item already carries `storageNodeId`); drop to post-v1 if the preview table
  gets crowded on mobile.
- Photo count/size limits for evidence (mirror report-photo limits) — confirm with
  backend at CP-2.
