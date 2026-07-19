# 10-wms / 07 — Replenishments (frontend)

> **Status:** not-started · **Depends on:** 05, 06 (CP-1); backend 02 CP-3
> **Owner:** — · **Last updated:** 2026-07-19

Bulk restocking as a first-class **document** (decided 2026-07-05): import a stock list
from a file, fix rows inline, attach evidence photos, confirm — the backend emits the
inbound movements (`reason: replenishment`, `replenishmentId` backlink). Owner/admin/
**office** (this is the office role's headline workflow). Documents are append-only:
no edit, no delete — corrections are readjustments (06).

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
ParsePreview { fileKey, fileName, rows: ParseRow[] }
ParseRow { line, sku, materialId?, materialName?, tracking?,
           quantity?, serial?, error?: ParseRowError }
ParseRowError = 'unknown_sku' | 'bad_quantity' | 'missing_serial'
              | 'duplicate_serial' | 'serial_exists' | 'quantity_on_serialized'
ReplenishmentsQuery { warehouseId?, from?, to?, page, limit }
```

Row-error labels: `model/constants/wms/parse-row-error-labels.const.ts` (error-clarity
rule: cause + fix, e.g. `unknown_sku` → "SKU no encontrado — corrige el SKU o crea el
material"). Rendered via pipe.

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
rules apply — this is a flow, keep back/cancel escape routes + dirty-navigation guard):

1. **Destination** — warehouse `<p-select>` (required; subs included).
2. **File** — upload card (`.xlsx`/`.csv`/`.txt`, 1 MB cap) + **template download
   links** (static assets `superadmin/public/templates/reabastecimiento.csv` + `.xlsx`
   — columns `sku,quantity,serial`; serialized = one row per unit, quantity 1).
   On pick → `ParseReplenishmentFile` (`POST /replenishments/parse`) → preview. The
   file is already archived in R2 when the preview renders (evidence trail) —
   re-upload simply replaces the preview + `fileKey`.
3. **Preview table** — one row per file line: line no., sku, resolved material (name,
   tracking pill) or error pill, quantity/serial, **inline fixes**: sku + quantity +
   serial cells editable (`pInputText`/`<p-inputnumber>`); an edit re-validates
   **client-side against loaded materials** for instant feedback and the whole set is
   re-validated server-side at confirm (02 §6 — the preview is UX, not trust). Error
   summary chip row above ("3 filas con errores") anchor-links to the first error
   (error-summary rule). Optional per-row node select (target location within the
   warehouse).
4. **Evidence photos** — multi-image uploader (same pattern as report photos: pick →
   `POST /upload` → keep R2 keys; thumbnails with remove). Delivery photos, invoices,
   pallets.
5. **Notes** — textarea, optional.
6. **Confirm** — summary strip (n items, m units/qty total, destination) + submit
   **disabled while any row error remains** or no items. `CreateReplenishment` →
   success → route to the new `replenishment-view`, toast with folio.

### `wms/pages/replenishment-view/` (`/warehouse/replenishments/:id`)

Read-only, forever: header card (folio, warehouse link, registered by, date, notes) ·
items table (material, tracking pill, qty | serials chips, node) · **evidence gallery**
(thumbnail grid → lightbox via `<p-dialog>`, same idiom as report photos) · source-file
download link (name + icon) · **"Ver movimientos"** link → the movements view
pre-filtered by `replenishmentId` (mounts 06's `movements-table` in an expandable
section right on this page — no separate route needed).

## 3. State + service

`ReplenishmentsState` (`src/state/replenishments/`) + `replenishments.service.ts`:
`list`, `total`, `selected`, `parsePreview` (rows + fileKey — cleared on route leave),
`loading`. Actions: `LoadReplenishments(query)`, `LoadReplenishment(id)`,
`ParseReplenishmentFile(file)`, `UpdatePreviewRow(line, patch)` (pure state edit +
client-side revalidation), `CreateReplenishment(payload)`.

## 4. Storage (backend ask — proposed 2026-07-19)

Dedicated **`manttio-wms` R2 bucket** for both the archived source files
(`imports/<key>`) and evidence photos (`evidence/<key>`), CDN-fronted with its own base
env (the `manttio-equipment` precedent — equipment photos got their own bucket + env'd
CDN base). Upload path: extend the existing upload module with the wms target (02 §8).
Until the bucket exists, dev can point at the reports bucket behind the same service
seam — **don't let the seam leak into components** (only `replenishments.service.ts` +
backend know where files live).

## 5. Testing

- e2e (`page.route` stubs): parse → preview renders all six error kinds with labels;
  inline fix clears an error client-side; submit stays disabled until clean; evidence
  add/remove; confirm payload shape asserted; view renders gallery + movements filter
  link; office can do everything here, technician can't route in.
- **Manual pass (original CP-5, binding):** import a 10-row csv with 2 bad rows → fix
  inline → attach 2 photos → confirm → stock updated (material view), movements show
  `replenishment` reason + link back to the folio; xlsx + txt variants parse; 1 MB+
  file rejected cleanly.

---

## Checkpoints

### CP-1 — List + state
- [ ] DTOs + `replenishments.service.ts` + `ReplenishmentsState` (lazy)
- [ ] Replenishments list with URL-persisted filters, folio format, row-click, CTA
      empty state; build green

### CP-2 — Register flow
- [ ] Template assets in `public/templates/` (csv + xlsx, documented columns)
- [ ] Register page: warehouse → upload/parse → editable preview (six error kinds,
      client-side revalidation, error summary anchors) → notes → confirm gating;
      dirty-navigation guard
- [ ] Evidence uploader (multi-image → R2 keys, thumbnails, remove)

### CP-3 — View + closing pass
- [ ] Replenishment view: items, gallery lightbox, source-file download,
      `movements-table` expandable filtered by `replenishmentId`
- [ ] Dark mode + skeletons + empty states; e2e specs; **manual pass above recorded
      here with date**

## Open decisions / asks
- SheetJS-on-Workers CPU check (02 §6) — if xlsx falls back to client-side conversion,
  this page adds the conversion step; keep the upload card seam ready.
- Template column set (`sku,quantity,serial`) — validate against a real provider list
  before CP-2 closes (master plan §5.2 item).
- Per-row node select in the preview (step 3) — ship v1 or defer? Spec: ship (the
  backend item already carries `storageNodeId`); drop to post-v1 if the preview table
  gets crowded on mobile.
- Photo count/size limits for evidence (mirror report-photo limits) — confirm with
  backend at CP-2.
