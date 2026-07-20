# 10-wms / 07 — Replenishments (frontend)

> **Status:** not-started · **Depends on:** 05, 06 (CP-1); backend 02 CP-3;
> 11 (queue consumer — live for the CP-3 manual pass, mockable before)
> **Owner:** — · **Last updated:** 2026-07-19

Bulk restocking as a first-class **document** (decided 2026-07-05): import a stock list
from a file, fix rows, attach evidence photos, and **approve** — approval promotes the
staged data into inventory and emits the inbound movements (`reason: replenishment`,
`replenishmentId` backlink). **Prep is owner/admin/office** (this is the office role's
headline workflow); **approval is owner/admin only** (decided 2026-07-19 —
`../14-access-control.md` §2.1e, the billing draft-vs-commit split). Documents are
append-only: no edit, no delete — corrections are readjustments (06).

**Import pipeline reworked 2026-07-19 (owner ask):** the fixed-template synchronous
parse is replaced by a **field-mapped asynchronous batch job** — upload the file →
the server detects its fields → the user maps them to our columns **in the app** →
the mapping is submitted and the backend's **Cloudflare Queues consumer**
(`11-processing-service.md`) parses/validates → the page **listens to the DB-backed
status over SSE** (`GET /replenishments/imports/:id/events` — 02 §6) until the
preview is ready.
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
- **Pending-approval strip** (added 2026-07-19): a compact card row above the table
  listing imports in `ready` (file name, warehouse, rows/errors, prepared by, age)
  with **"Revisar y aprobar"** → the register page with `?import=` (owner/admin;
  office sees its own pending imports with "Continuar preparación"). This is how an
  admin finds what office prepared.

### `wms/pages/replenishment-register/` (`/warehouse/replenishments/new`)

A **full page**, one column, progressive disclosure top-to-bottom (multi-step-progress
rules apply — this is a flow, keep back/cancel escape routes + dirty-navigation guard).
The active import's id persists as a **`?import=` query param** — reload/back returns
to the same job and resumes the status stream (URL-persistence rule applied to a
flow).

1. **Destination** — warehouse `<p-select>` (required before the mapping submits;
   subs included).
2. **File** — upload card (`.xlsx`/`.csv`/`.txt`, 1 MB cap) + **template download
   links** (static assets `superadmin/public/templates/reabastecimiento.csv` + `.xlsx`
   — columns `sku,quantity,serial`; the `sku` column takes SKU **or UPC**; serialized =
   one row per unit, quantity 1). On pick → `UploadImportFile`
   (`POST /replenishments/imports`) — the file is **staged in R2** immediately (the
   reference the queue consumer pulls it by; **transient** — the consumer purges
   the binary once it's fully processed, §4) and the response carries the **detected
   fields**. Re-upload discards the current import (`DiscardImport`,
   fire-and-forget) and starts a new one.
3. **Field mapper** (new 2026-07-19) — one row per detected file column: header
   (mono), sample-value chips (up to 5), and a target `<p-select>`: **Ignorar ·
   SKU / UPC · Cantidad · Serie**. Auto-mapped on arrival, two-tier (**tier 1
   resolved 2026-07-19 — supersedes the "mapping presets" open item**): the upload
   response's `suggestedMapping` — the tenant's **last-used mapping from the
   settings store**, returned when headers match (01 §2 `settings`, 02 §6) — else
   header heuristics (`import-auto-map-patterns.const.ts`:
   `sku|c[oó]digo|clave|upc|ean` → sku · `cant|qty|quantity|pzas?` → quantity ·
   `serie|serial|s/n` → serial — first match wins, one target per column); user
   overrides freely. Validation mirrors the
   backend (`invalid_mapping`): SKU/UPC mapped + at least one of Cantidad/Serie —
   **"Procesar archivo"** stays disabled until valid, then dispatches
   `SubmitImportMapping` → 202.
4. **Processing panel** — replaces the mapper while the job runs: status pill
   (En cola / Procesando), `<p-progressbar>` off `progress.processed/total`
   (indeterminate until `total` is known), live counters ("128 / 300 filas · 4
   errores"), and the **status stream** (§3.1). `failed` → error card with the
   stored `error`, retry = re-upload (escape route). Skeleton, not spinner.
5. **Preview table** — renders when `ready`, seeded from the **staged rows** (the
   temp table in the tenant DB — 01 §2): line no., mapped source value, resolved
   material (name, tracking pill) or error pill, quantity/serial, optional per-row
   node select. **Inline fixes persist to staging**: an edit dispatches
   `UpdatePreviewRow` → `PATCH .../rows/:line` — the server re-resolves
   (SKU-then-UPC) + re-validates and returns the row, so fixes survive reloads and
   **carry across users** (office fixes, admin approves). Error summary chip row
   above ("3 filas con errores") anchor-links to the first error (error-summary
   rule).
6. **Evidence photos** — attach **after processing, at review time** (owner
   2026-07-19): multi-image uploader (pick → `POST /upload` → R2 keys; thumbnails
   with remove), persisted to the import via `UpdateImportPrep`
   (`PATCH /replenishments/imports/:id`). Delivery photos, invoices, pallets.
7. **Notes** — textarea, optional; same `UpdateImportPrep` persistence (debounced on
   blur).
8. **Approval** — summary strip (n items, m units/qty total, destination). Role
   split: **owner/admin** see **"Aprobar reabastecimiento"** — disabled while any
   row error remains or no items — dispatching `ApproveReplenishment(importId)`
   (`POST /replenishments` — the backend promotes the staging table into inventory,
   02 §6) → route to the new `replenishment-view`, toast with folio. **Office**
   sees a status card instead ("Preparado — esperando aprobación de un
   administrador"): their prep is already fully staged, there is nothing to submit
   and no approve affordance rendered (hidden, never disabled).

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
fields, progress, staged rows, prep), `pendingImports` (the ready-state strip),
`loading`. Actions: `LoadReplenishments(query)`, `LoadPendingImports`,
`LoadReplenishment(id)`, `UploadImportFile(file)`,
`SubmitImportMapping(importId, warehouseId, mapping)`, `ListenImportStatus(importId)`,
`StopImportListening`, `DiscardImport(importId)`, `UpdatePreviewRow(line, patch)`
(server PATCH — staged-row fix, state updated from the response),
`UpdateImportPrep(importId, { evidencePhotos?, notes? })`,
`ApproveReplenishment(importId)` (owner/admin — the promotion).

### 3.1 Status stream (SSE — owner 2026-07-19, supersedes the polling loop)

The status truth stays the **database row**; the page listens on
`GET /replenishments/imports/:id/events` (02 §6) instead of polling — one HTTP
connection, events pushed on change, **closed by the server after the terminal
event** (owner rationale: repeated polling requests invite avoidable errors/load).

- **Client:** `EventSource` can't send the `Authorization` header, so the service
  wraps a **fetch-based SSE reader** (fetch + `ReadableStream` line parser, Bearer
  header, `Accept: text/event-stream`) in an RxJS observable — kept private to
  `replenishments.service.ts` until a second SSE consumer justifies extracting it.
- `ListenImportStatus(importId)` is one RxJS pipeline
  (`@Action(..., { cancelUncompleted: true })` — one listener at a time): initial
  one-shot `GET .../imports/:id` (render current state instantly) → switch to the
  stream → `tap` patches state → completes on the terminal event.
  `StopImportListening` (route leave via `DestroyRef`) cancels outright.
- **Resume from URL:** unchanged — the register page reads `?import=` on init and
  dispatches `ListenImportStatus` if the loaded status is non-terminal.
- **Reconnect:** a dropped stream retries with capped backoff (1 s → 5 s), always
  restarting from a fresh one-shot GET (payloads are full snapshots, not deltas —
  no event-id bookkeeping); a 404/403 stops with a toast.

## 4. Storage (backend ask — proposed 2026-07-19)

Dedicated **`manttio-wms` R2 bucket**, CDN-fronted with its own base env (the
`manttio-equipment` precedent), holding two very different lifecycles:

- **`imports/<key>` — transient** (owner 2026-07-19): uploads are **copies** — the
  tenant keeps the original file, so there is never a download or recovery need.
  The staged binary exists only from upload until the queue consumer finishes
  with it — the consumer purges it after the `ready` write and stamps
  `file_deleted_at` (01 §4, 11 §2); leftovers from abandoned imports are swept by
  the daily cron (11 §4). Space stays flat no matter how many imports run.
- **`evidence/<key>` — permanent**: delivery photos, invoices, pallets — the human
  evidence on the confirmed document; never purged.

Upload path: extend the existing upload module with the wms target (02 §8). Until the
bucket exists, dev can point at the reports bucket behind the same service seam —
**don't let the seam leak into components** (only `replenishments.service.ts` +
backend know where files live).

## 5. Testing

- e2e (`page.route` stubs — `/events` fulfilled with a **scripted
  `text/event-stream` body** `queued → processing(2) → ready`; all events in one
  response is fine, the reader consumes them in order): upload → mapper renders
  detected fields + samples; `suggestedMapping` prefill applies when stubbed,
  heuristics otherwise; mapping validation gates the
  submit; processing panel ticks progress off the stubbed sequence; `failed` path
  shows the error card; **reload mid-processing resumes the stream from
  `?import=`**;
  preview renders all six error kinds with labels; inline fix PATCHes the staged row
  (stubbed) and the returned clean row clears the error; approve stays disabled until
  clean; evidence add/remove persists via prep PATCH; **role split: admin sees
  "Aprobar", office sees the waiting card and no approve affordance**; pending-
  approval strip routes into `?import=`; approval payload (`{ importId }`) asserted;
  view renders gallery + movements filter link; technician can't route in.
- **Manual pass (original CP-5, binding — needs the queue consumer live, 11 CP-3),
  run as the two-actor flow:** as **office** — import a 10-row csv with 2 bad rows
  and non-template headers → map fields → watch queued/processing → fix rows inline
  → attach 2 photos + notes → waiting card; as **admin** — pending strip → review →
  approve → stock updated (material view), movements show `replenishment` reason +
  link back to the folio; xlsx + txt variants; 1 MB+ file rejected cleanly; force a
  mid-job failure (throw in the handler) → Queues redelivery completes it
  idempotently (11 §3).

---

## Checkpoints

### CP-1 — List + state
- [ ] DTOs + `replenishments.service.ts` + `ReplenishmentsState` (lazy)
- [ ] Replenishments list with URL-persisted filters, folio format, row-click, CTA
      empty state; pending-approval strip (role-split CTAs); build green

### CP-2 — Import: upload → mapper → processing
- [ ] Template assets in `public/templates/` (csv + xlsx, documented columns)
- [ ] Upload card (formats, cap, archive-on-upload; re-upload discards the prior
      import); import DTOs + upload/mapping/listen/discard actions
- [ ] Field mapper: detected columns + sample chips, target selects, two-tier
      auto-map (`suggestedMapping` prefill, heuristics fallback), backend-mirrored
      validation gating "Procesar archivo"
- [ ] Processing panel + status stream per §3.1 (fetch-SSE reader with Bearer
      header, cancelUncompleted, route-leave stop, `?import=` resume, reconnect
      backoff, failed card); dirty-navigation guard

### CP-3 — Review → approval + view
- [ ] Preview from staged rows: six error kinds, PATCH-persisted inline fixes
      (server re-resolution reflected), error summary anchors, per-row node select
- [ ] Evidence uploader + notes persisted via `UpdateImportPrep`; approval step with
      role split (admin approve button + gating, office waiting card, affordance
      hidden not disabled)
- [ ] Replenishment view: items, gallery lightbox, source-file name metadata (via
      import join), `movements-table` expandable filtered by `replenishmentId`
- [ ] Dark mode + skeletons + empty states; e2e specs; **two-actor manual pass above
      recorded here with date**

## Open decisions / asks
- ~~SheetJS-on-Workers CPU check~~ — **retired 2026-07-19**: parsing lives in the
  Queues consumer with a raised CPU limit (11); the request path only detects
  fields.
- Auto-map heuristics (§2 step 3) — validate the patterns against real provider
  lists before CP-2 closes (supersedes the old fixed-template column validation,
  master plan §5.2 item).
- ~~Mapping presets~~ — **resolved 2026-07-19 (owner): the `settings` key-value
  store** (01 §2) remembers the last-used mapping by header text; upload returns
  `suggestedMapping` when headers match (§2 step 3 tier 1).
- **Notifying admins of pending approvals** (beyond the in-list strip): toast/badge
  on login? email? Defer until real office→admin traffic shows the strip isn't
  enough.
- Per-row node select in the preview (§2 step 5) — ship v1 or defer? Spec: ship (the
  backend item already carries `storageNodeId`); drop to post-v1 if the preview table
  gets crowded on mobile.
- Photo count/size limits for evidence (mirror report-photo limits) — confirm with
  backend at CP-2.
