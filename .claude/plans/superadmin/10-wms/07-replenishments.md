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
                       unprocessableCount,   // > 0 ⇒ warning marker (owner 2026-07-20)
                       evidenceCount, user: { id, name }, createdAt }
Replenishment = ReplenishmentSummary + {
  importId,                                  // backlink → the import: audit + snapshot
                                             //   (the view loads LoadImportAudit by it)
  items: { material: MaterialRef, quantity?, serials?: string[],
           node?: { id, name },
           unprocessable: boolean, error?: ParseRowError }[],  // flagged, stock-less
  evidencePhotos: string[],                  // CDN URLs, materialized server-side
  sourceFileName?, notes?                    // name only — the binary is purged
}
ReplenishmentImport {                       // dto for the async job (added 2026-07-19)
  id, status: ReplenishmentImportStatus, fileName,
  fields: ImportField[], mapping?: ImportMapping,
  progress: { total?, processed, errors }, error?,
  rejectionComment?,                        // present when status = 'rejected' — the
                                            //   admin's feedback (latest reject event), 2026-07-20
  submissionSnapshot?,                      // human-readable JSON text of the
                                            //   submission (file + mapping), 2026-07-20
  rows?: ParseRow[]                         // present once status = 'ready'
}
ImportField { id, header, samples: string[] }
ImportMapping { sku: string, quantity?: string, serial?: string,
                lot?: string, expiry?: string }   // → field ids (lot + expiry 2026-07-20)
ReplenishmentImportStatus = 'uploaded' | 'queued' | 'processing' | 'ready'
                          | 'rejected' | 'failed' | 'confirmed' | 'stale' | 'cancelled'
ParseRow { line, raw, materialId?, materialName?, tracking?,
           quantity?, serial?, lot?, lotExpiresAt?, error?: ParseRowError }
ParseRowError = 'unknown_sku' | 'bad_quantity' | 'missing_serial'
              | 'duplicate_serial' | 'serial_exists' | 'quantity_on_serialized'
              | 'missing_lot' | 'bad_expiry'   // lot: missing_lot + bad_expiry only;
                                               // lot re-receipt is a top-up, not an error
ImportEvent { type: ImportEventType,                 // whole-lifecycle audit (2026-07-20)
              actor?: { id, name },                  // null for system events
              line?, reason?, details,               // details shape per type (01 §2)
              createdAt }
ImportEventType = 'created' | 'mapping_submitted' | 'processing_started'
                | 'processed' | 'processing_failed' | 'row_updated' | 'row_removed'
                | 'evidence_updated' | 'notes_updated' | 'rejected' | 'resubmitted'
                | 'stale' | 'cancelled' | 'approved'
ReplenishmentsQuery { warehouseId?, from?, to?, page, limit }
```

Row-error labels: `model/constants/wms/parse-row-error-labels.const.ts` (error-clarity
rule: cause + fix, e.g. `unknown_sku` → "SKU o UPC no encontrado — corrige el código o
crea el material"). Rendered via pipe. The `sku` file column accepts **SKU or UPC**
(02 §6 — provider lists and scan-built sheets usually carry the barcode).

## 2. Pages

### `wms/pages/replenishments-list/` (`/warehouse/replenishments`)

- Lazy `<p-table>` via `ListQueryService` (params `warehouseId`, `from`, `to`, `page`):
  folio (font-data, `#000123` style), warehouse, item count (+ amber warning icon
  with count when `unprocessableCount > 0`), evidence count (camera icon + n),
  registered by, date. Filters: warehouse select, date range.
- Row click → `replenishment-view`. Header action **"Registrar reabastecimiento"** →
  routes to `/warehouse/replenishments/new` (full page — the flow is too big for a
  dialog, decided 2026-07-05). Empty state with the same CTA.
- **One in-flight import per parent warehouse** (owner 2026-07-20, was per-tenant):
  when a pre-approval import exists **for the destination's parent warehouse**, the
  "Registrar" button instead reads **"Continuar reabastecimiento"** and
  routes to it (`?import=`) — the pending-approval strip already surfaces it. The
  register page enforces the same on load (below), and the backend is the authority
  (`409 import_in_progress`, keyed on `parent_warehouse_id` — sub-warehouses/vans
  share their parent's slot; 02 §6).
- **Pending-approval strip** (added 2026-07-19): a compact card row above the table
  listing imports in `ready` (file name, warehouse, rows/errors, prepared by, age)
  with **"Revisar y aprobar"** → the register page with `?import=` (owner/admin;
  office sees its own pending imports with "Continuar preparación"). This is how an
  admin finds what office prepared. **Rejected imports surface here too** (owner
  2026-07-20): an import in `rejected` shows to office (and owner/admin) with a
  **"cambios solicitados"** pill + a feedback preview and **"Ajustar y reenviar"** →
  the register page `?import=` — office's entry point to the adjustment loop. (The
  manager app-shell banner, §3, counts `ready` only — a rejected import is back with
  office, not awaiting approval.)

### `wms/pages/replenishment-register/` (`/warehouse/replenishments/new`)

A **full page**, one column, progressive disclosure top-to-bottom (multi-step-progress
rules apply — this is a flow, keep back/cancel escape routes + dirty-navigation guard).
The active import's id persists as a **`?import=` query param** — reload/back returns
to the same job and resumes the status stream (URL-persistence rule applied to a
flow). **On load without `?import=`, once a destination is chosen the page checks for
an existing pre-approval import for that destination's parent warehouse** (one-in-flight
rule — now **per parent warehouse**, owner 2026-07-20, was per-tenant; 02 §6): if one
exists it redirects to it (`?import=`) rather than showing a fresh upload — a fresh
import for that parent warehouse can only start once the current one is approved,
cancelled, or gone stale (sub-warehouses/vans share their parent's slot; different
parent warehouses import concurrently).

1. **Destination** — warehouse `<p-select>` (**required before upload** — warehouse-first,
   owner 2026-07-21; subs included).
2. **File** — upload card (`.xlsx`/`.csv`/`.txt`, 1 MB cap) + **template download
   links** (static assets `superadmin/public/templates/reabastecimiento.csv` + `.xlsx`
   — columns `sku,quantity,serial`; the `sku` column takes SKU **or UPC**; serialized =
   one row per unit, quantity 1). On pick → `UploadImportFile(warehouseId, file)`
   (`POST /replenishments/imports` with the chosen destination — the import is
   warehouse-bound and the **one-in-flight guard fires here**, §2 / 02 §6) — the file is
   **staged in R2** immediately (the
   reference the queue consumer pulls it by; **transient** — the consumer purges
   the binary once it's fully processed, §4) and the response carries the **detected
   fields**. Re-upload discards the current import (`DiscardImport`,
   fire-and-forget) and starts a new one.
3. **Field mapper** (new 2026-07-19) — one row per detected file column: header
   (mono), sample-value chips (up to 5), and a target `<p-select>`: **Ignorar ·
   SKU / UPC · Cantidad · Serie · Lote · Caducidad** (Lote + Caducidad added
   2026-07-20; Caducidad optional, only meaningful alongside Lote). Auto-mapped on
   arrival, two-tier (**tier 1
   resolved 2026-07-19 — supersedes the "mapping presets" open item**): the upload
   response's `suggestedMapping` — the tenant's **last-used mapping from the
   settings store**, returned when headers match (01 §2 `settings`, 02 §6) — else
   header heuristics (`import-auto-map-patterns.const.ts`:
   `sku|c[oó]digo|clave|upc|ean` → sku · `cant|qty|quantity|pzas?` → quantity ·
   `serie|serial|s/n` → serial · `lote|lot|batch` → lot ·
   `cad|venc|exp|caduc` → expiry — first match wins, one target per column); user
   overrides freely. Validation (mirrors backend `invalid_mapping`): SKU/UPC mapped
   + at least one of Cantidad/Serie/Lote (Caducidad alone is not enough). Validation mirrors the
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
   material (name, tracking pill) or error pill, quantity/serial/**lot (+ expiry
   when mapped)**, optional per-row node select. **Lot rows show a "+ N existentes"
   hint** when the lot already carries balance (in-file repeats aggregate; existing
   stock tops up — re-receipt, 01 §2), so the reviewer sees it's adding to a known
   lot, not a mistake. **Errors render in two classes** (owner 2026-07-20,
   `unprocessable-row-errors.const.ts`): **fixable** (red pill — blocks approval
   until fixed) and **"No procesable"** (amber pill — serie duplicada; helper copy
   "revisa tus registros o contacta a tu proveedor"; does *not* block). Lot repeats
   are neither — they render as normal top-ups.
   **Editing staged rows persists to staging** (owner 2026-07-20 — editable on
   **every** row, not only errored ones): the **quantity** cell of any
   unserialized/lot row is editable to correct what actually arrived vs what the
   file said ("llegaron 95, no 100") — the common real-world case, independent of
   any parse error; serialized rows edit the **serial** (their quantity is fixed at
   1 per unit), lot rows also edit the **lot number**, and every row can set its
   node. An edit dispatches `UpdatePreviewRow` → `PATCH .../rows/:line` — the server
   re-resolves (SKU-then-UPC) + re-validates and returns the row, so edits survive
   reloads and **carry across users** (office edits, admin approves); a corrected
   serial clears the unprocessable flag too. **Hand-edited rows carry a subtle
   "editado" marker** (backed by the audit trail — below) so the approver sees which
   quantities were adjusted from the file; the summary strip (step 8) recomputes
   live. Quantity stays **> 0** (0 → `bad_quantity`, a fixable error).
   **Row removal — owner/admin only** (owner 2026-07-20; office never sees the
   affordance): a trash action opens `remove-staged-row-dialog` (shape 2, **required
   reason** — audit-comment convention) → `RemoveStagedRow` → `DELETE .../rows/:line`.
   For "no llegó nada" without the audit weight, editing to the real received
   quantity is the office path; outright removal is the admin path and is logged.
   Error summary chip row above splits the classes ("2 por corregir · 1 no
   procesable") and anchor-links to the first of each (error-summary rule).
   **Accountability — the "Historial" tab** (owner 2026-07-20): once the import is
   `ready` this page **is** the approval-request screen (owner/admin reach it from
   the pending strip), so the review surface is organized into **`<p-tabs>`** —
   **"Revisión"** (the preview table + edits + evidence + notes + approval,
   steps 5–8) and **"Historial"** (the audit). The audit gets its own tab, not an
   inline panel (owner directive). The **Historial** tab renders the
   whole-lifecycle timeline (`LoadImportAudit` → `GET .../audit`) — start → upload →
   mapping → processing → each edit/removal → evidence/notes → (later) approval —
   each entry showing actor (or "Sistema" for consumer events), what happened
   (before→after on edits, removal reason, `{total, errors}` on processed…), and
   timestamp, so the approver sees the full provenance before signing off. The same
   tab holds a **"Ver envío"** toggle for the `submissionSnapshot` — the
   human-readable JSON of the original file + applied mapping (read-only `<pre>`,
   copyable), the durable record of what was submitted (01 §2). Office sees the
   identical two-tab layout (its prep lives in Revisión); the approve affordance
   stays owner/admin (step 8). The **timeline is one reusable component** — the
   confirmed `replenishment-view` mounts it again (below).
6. **Evidence photos** — attach **after processing, at review time** (owner
   2026-07-19): multi-image uploader (pick → `POST /upload` → R2 keys; thumbnails
   with remove), persisted to the import via `UpdateImportPrep`
   (`PATCH /replenishments/imports/:id`). Delivery photos, invoices, pallets.
7. **Notes** — textarea, optional; same `UpdateImportPrep` persistence (debounced on
   blur).
8. **Approval / rejection** — the "Revisión" tab's action row: summary strip (n
   items, m units/qty total, destination), plus a **warning line when unprocessable
   rows exist** ("2 filas se registrarán como no procesables — sin efecto en
   inventario"). It is **status-driven** (owner 2026-07-20 — the reject→adjust→
   re-request loop):
   - **`ready` · owner/admin** — **"Aprobar reabastecimiento"** (disabled while any
     **fixable** row error remains or no processable items) → `ApproveReplenishment`
     (`POST /replenishments`, promotes staging → inventory, 02 §6) → route to the new
     `replenishment-view`, toast with folio. Beside it, **"Rechazar"** (secondary,
     danger-tone) opens **`reject-import-dialog`** (shape 2, **required comment** —
     the feedback for office) → `RejectImport(importId, comment)` (`POST .../reject`)
     → status `rejected`; the comment is written to the audit trail (`rejected`
     event) and shown back to office (below).
   - **`ready` · office** — a status card ("Preparado — esperando aprobación de un
     administrador"): fully staged, nothing to submit, **no approve/reject affordance
     rendered** (hidden, never disabled).
   - **`rejected` · everyone** — a prominent **feedback panel** at the top of the
     Revisión tab: "Un administrador solicitó cambios: «{rejectionComment}»"
     (warning tone; the comment from the import DTO — 02 §6). Office (and owner/admin)
     adjust the staged rows / evidence / notes **in place** — the same edit
     affordances stay live (`rejected` is editable, 02 §6) — then **"Solicitar
     aprobación de nuevo"** → `ResubmitImport(importId)` (`POST .../resubmit`) → back
     to `ready`, which **re-notifies the manager** (banner + email, §3 / 11 §2) and
     emits `resubmitted`.
   - **Owner-only · any pre-approval status** — **"Cancelar reabastecimiento"**
     (danger, **owner only** — not admin, not office) opens **`cancel-import-dialog`**
     (**required reason**) → `CancelImport(importId, reason)` (`POST .../cancel`) →
     terminal **`cancelled`**: the staging rows are **truncated** and the import
     record **closed** in one transaction; the reason lands in the audit trail as a
     `cancelled` event (the permanent record survives the truncate). Distinct from
     **discard** (the benign abandon / re-upload file-swap, any prep role,
     cron-cleaned) — cancel is the owner's authoritative kill: immediate + reasoned.
     A **confirmed** replenishment can't be cancelled — it's a permanent document;
     correct it with a readjustment (06).

### `wms/pages/replenishment-view/` (`/warehouse/replenishments/:id`)

Read-only, forever: header card (folio, warehouse link, registered by, date, notes) ·
items table (material, tracking pill, qty | serials chips, node; **unprocessable
items render with the amber "No procesable" pill + error label** — they exist for
awareness, zero stock effect, helper copy pointing at record review / provider
follow-up) · **evidence gallery**
(thumbnail grid → lightbox via `<p-dialog>`, same idiom as report photos) ·
source-file **name** (file icon + name, metadata only — the binary was purged after
processing; the imported rows themselves are the durable record) ·
**"Ver movimientos"** link → the movements view
pre-filtered by `replenishmentId` (mounts 06's `movements-table` in an expandable
section right on this page — no separate route needed) ·
**"Historial" section** — the whole-lifecycle audit timeline, read-only, loaded via
the doc's linked import (`LoadImportAudit(replenishment.importId)` →
`GET .../imports/:id/audit`) and rendering the **same reusable timeline component**
as the approval-request Historial tab (§2 step 5), so the confirmed document
carries its full provenance forever (the `approved` event closes the trail); the
`submissionSnapshot` is reachable here too via the same **"Ver envío"** toggle.
**(owner 2026-07-20 — the audit now shows on _both_ the approval-request screen and
the confirmed details; supersedes the earlier "review-panel-only, not on the view"
call.)**

### Approval notifications — banner + warning email (owner 2026-07-20)

Beyond the in-list pending strip (§2), the configured **CMS-manager** is actively
warned when replenishments await approval — resolving the deferred "notify admins of
pending approvals" open item. Both channels read the recipient from the same config
record (`notifications.manager_user_id`, 01 §2):

- **App-shell banner** — `pending-replenishments-banner`, mounted in the superadmin
  shell so it shows on any page for the configured manager (**falls back to
  owner/admin when the config record is unset**, so approvals are never missed).
  Driven by `pendingImports` (`LoadPendingImports` on shell init — cheap, the same
  read the list strip uses, no new endpoint): "Tienes N reabastecimientos por
  aprobar", **warning severity** when any carry unprocessable rows, click → the
  pending list (or straight to the single `?import=`). Dismissible per session,
  re-appears on new pending imports. Uses the superadmin-design banner idiom — no
  bespoke styling.
- **Warning email** — fired **backend-side by the queue consumer** on the `ready`
  transition (11 §2), so it needs no frontend surface; de-branded (tenant brand
  config), to the configured manager: warehouse, row/error counts, a prominent
  **unprocessable-rows warning** when present, and a deep link to the
  approval-request screen. The same channel carries the `failed` alert. Best-effort;
  unconfigured recipient ⇒ skipped (banner + strip remain the floor).

## 3. State + service

`ReplenishmentsState` (`src/state/replenishments/`) + `replenishments.service.ts`:
`list`, `total`, `selected`, `import` (the active `ReplenishmentImport` — status,
fields, progress, staged rows, prep), `pendingImports` (the ready-state strip **and
the app-shell approval banner** — one read serves both),
`loading`. Actions: `LoadReplenishments(query)`, `LoadPendingImports`,
`LoadReplenishment(id)`, `UploadImportFile(warehouseId, file)`,
`SubmitImportMapping(importId, mapping)`, `ListenImportStatus(importId)`,
`StopImportListening`, `DiscardImport(importId)`, `UpdatePreviewRow(line, patch)`
(server PATCH — staged-row edit incl. **quantity on any row**, owner 2026-07-20;
audited; state updated from the response),
`RemoveStagedRow(line, reason)` (owner/admin — `DELETE .../rows/:line`, audited),
`LoadImportAudit(importId)` (the whole-lifecycle event log — feeds **both** the
approval-request Historial tab and the confirmed `replenishment-view`; the view
passes `selected.importId`),
`UpdateImportPrep(importId, { evidencePhotos?, notes? })`,
`RejectImport(importId, comment)` (owner/admin — `POST .../reject`, required comment,
`ready` → `rejected`, audited),
`ResubmitImport(importId)` (owner/admin/office — `POST .../resubmit`, `rejected` →
`ready`, re-notifies the manager, audited),
`CancelImport(importId, reason)` (**owner only** — `POST .../cancel`, required reason,
any pre-approval status → `cancelled`; truncates staging + closes the record,
audited),
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

**Two dedicated R2 buckets** (owner 2026-07-20 — split from the single `manttio-wms`
bucket), each CDN-fronted with its own base env (the `manttio-equipment` precedent),
for two very different lifecycles:

- **`manttio-wms-sheets`, `imports/<key>` — transient** (owner 2026-07-19): uploads
  are **copies** — the tenant keeps the original file, so there is never a download
  or recovery need. The staged binary exists only from upload until the queue consumer
  finishes with it — the consumer purges it after the `ready` write and stamps
  `file_deleted_at` (01 §4, 11 §2); leftovers from abandoned imports are swept by
  the daily cron (11 §4). Space stays flat no matter how many imports run.
- **`manttio-wms-evidence`, `evidence/<key>` — permanent**: delivery photos, invoices,
  pallets — the human evidence on the confirmed document; never purged.

Upload path: extend the existing upload module with the wms targets (02 §8). Until the
buckets exist, dev can point at the reports bucket behind the same service seam —
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
  preview renders all six error kinds with labels in their two classes (red fixable
  vs amber "No procesable"); inline fix PATCHes the staged row (stubbed) and the
  returned clean row clears either flag; approve stays disabled on fixable errors
  but **enables with only unprocessable rows present** (warning line shown);
  evidence add/remove persists via prep PATCH; **role split: admin sees
  "Aprobar", office sees the waiting card and no approve affordance**; pending-
  approval strip routes into `?import=`; approval payload (`{ importId }`) asserted;
  view renders gallery + movements filter link; technician can't route in.
- **Manual pass (original CP-5, binding — needs the queue consumer live, 11 CP-3),
  run as the two-actor flow:** as **office** — import a 10-row csv with 2 bad rows
  and non-template headers **plus 1 row whose serial already exists in stock** →
  map fields → watch queued/processing → fix the fixable rows inline (the
  serial-collision row stays "No procesable") → attach 2 photos + notes → waiting
  card; as **admin** — pending strip → review (warning line: 1 no procesable) →
  approve → stock updated for processable items only (material view), the view
  shows the flagged item with zero stock effect, movements show `replenishment`
  reason + link back to the folio; xlsx + txt variants; 1 MB+ file rejected cleanly; force a
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
- [ ] Preview from staged rows: error kinds in two classes, lot rows with expiry +
      top-up hint, PATCH-persisted edits incl. **quantity on any row** (server
      re-resolution reflected, "editado" marker), error summary anchors, per-row
      node select
- [ ] **Row removal (owner/admin only, office hidden)**: `remove-staged-row-dialog`
      (required reason) → `RemoveStagedRow`; **tabbed ready review surface**
      (`<p-tabs>` Revisión / Historial) with the **Historial tab** timeline
      (`LoadImportAudit`, whole lifecycle, actor/system + details) + **"Ver envío"**
      submission-snapshot toggle — timeline built as a **reusable component**
- [ ] Evidence uploader + notes persisted via `UpdateImportPrep`; approval step with
      role split (admin approve button + gating, office waiting card, affordance
      hidden not disabled); **reject → `reject-import-dialog` (required comment) →
      `RejectImport`; `rejected` feedback panel + adjust-in-place + "Solicitar
      aprobación de nuevo" → `ResubmitImport`; `rejected` pill + list "Ajustar y
      reenviar" CTA; owner-only "Cancelar" → `cancel-import-dialog` (required reason)
      → `CancelImport` (terminal `cancelled`, staging truncated)**
- [ ] Replenishment view: items, gallery lightbox, source-file name metadata (via
      import join), `movements-table` expandable filtered by `replenishmentId`,
      **Historial audit section** (reused timeline via `replenishment.importId`)
- [ ] **Approval notifications**: `pending-replenishments-banner` in the superadmin
      shell (configured manager, owner/admin fallback; warning severity on
      unprocessable; reuses `pendingImports`, no new endpoint). Warning email lands
      with the queue consumer (11 CP-2), recipient from `notifications.manager_user_id`
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
- ~~Notifying admins of pending approvals (beyond the in-list strip)~~ —
  **resolved 2026-07-20 (owner): both** — an app-shell **banner** for the configured
  CMS-manager + a **warning email** on the `ready` (and `failed`) transition. The
  recipient is the `notifications.manager_user_id` config record (01 §2); the email
  is sent by the queue consumer (11 §2), the banner reuses `pendingImports` (§2/§3).
- Per-row node select in the preview (§2 step 5) — ship v1 or defer? Spec: ship (the
  backend item already carries `storageNodeId`); drop to post-v1 if the preview table
  gets crowded on mobile.
- Photo count/size limits for evidence (mirror report-photo limits) — confirm with
  backend at CP-2.
