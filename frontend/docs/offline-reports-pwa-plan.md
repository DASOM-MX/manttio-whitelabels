# Offline report queueing + installable PWA — Implementation Plan

**Branch:** `feature/fullstack-report-add-overhaul` (or a dedicated `feature/frontend-offline-reports-pwa`)
**Status:** Approved — not yet started
**Last updated:** 2026-05-24

---

## Goal

Let field technicians create reports with **no internet connection** and upload them once
back online. The app must also be **installable** (home-screen shortcut on phones).

### Approved decisions
- **Storage:** IndexedDB (via Dexie). *Not* localStorage — it can't hold `File`/`Blob` and caps ~5 MB.
- **PWA:** Yes — manifest + Angular service worker. Required for installability; the service
  worker also caches the app shell so the app **boots offline** (not just "while the tab stays open").
- **Write strategy:** Fallback-only-when-offline. The online submit path stays byte-for-byte
  identical to today; we only divert to IndexedDB when `navigator.onLine === false`.
- **Sync trigger:** Prompt the user on reconnect (+ manual upload buttons). No silent auto-sync.

---

## Architecture in one line

Online → unchanged (direct POST). Offline submit → IndexedDB (full payload incl. picture/signature
`Blob`s + the creating user's id). On reconnect with a non-empty queue → prompt → replay each
queued report through the existing `ReportsService.create()`. Service worker makes the app
installable and bootable offline.

---

## Data model

### IndexedDB (Dexie) — table `pendingReports`
```ts
interface PendingReport {
  tempId: string;             // crypto.randomUUID()
  fields: CreateReportFields; // full payload incl. pictures: File[], signature blob
  createdBy: {                // captured from AuthState.user at enqueue time
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;          // when queued offline (ISO)
  status: 'pending' | 'uploading' | 'failed';
  lastError?: string;
}
```
- `fields.date_arrival` already carries the **real field timestamp** (from `draft.arrivalAt`), so a
  report uploaded hours later keeps its true arrival time — comes for free since we persist `fields` verbatim.
- `createdBy` is stored so attribution survives **phone swaps between technicians/admins**. See
  "Creator attribution" below for the sync-time behavior and the backend follow-up.

### NGXS slice `OfflineReportsState` — UI mirror only (no blobs)
```ts
{
  pending: {
    tempId: string;
    reportType: ReportType;
    clientId: string;
    createdBy: { id: string; name: string; email: string };
    createdAt: string;
    status: 'pending' | 'uploading' | 'failed';
    lastError?: string;
  }[];
  uploading: boolean; // global guard against double-sync
}
```
Deliberately **not** added to `@ngxs/storage-plugin` keys — IndexedDB is the source of truth; this
slice is just a reactive projection for the UI.

---

## Creator attribution (phone-swap safety)

- At enqueue time we snapshot `AuthState.user` → `PendingReport.createdBy`.
- The pending UI labels each report with its creator name (so an admin can tell whose report it is).
- **At sync time**, if `AuthState.user.id !== pendingReport.createdBy.id` (phone was handed to a
  different user who logged in), show a confirm:
  *"Este reporte fue creado por {createdBy.name} pero la sesión actual es {currentUser.name}.
  ¿Subir de todas formas?"*
- **Backend follow-up (flagged):** the server currently derives `createdBy` from the bearer token,
  so a report uploaded under user B's token is attributed to B. To attribute it to the *original*
  creator we need the backend `POST /reports` to accept an explicit `created_by`. Until then the
  client stores/displays the true creator and warns on mismatch, but server attribution = token user.

---

## Implementation phases

### Phase 0 — PWA enablement — ✅ DONE
- [x] Added `@angular/service-worker@20.0.7`. Also **aligned NGXS 21 → 20.1.0** (peer `@angular/core >=20 <21`)
      so the dep tree resolves cleanly without `--legacy-peer-deps` — the repo was on Angular 20 but NGXS 21.
- [x] Wired `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })` in `app.config.ts`.
- [x] `ngsw-config.json` (frontend root) — `index: /index.html`, prefetch app shell, lazy assets/icons.
      No `dataGroups` → the cross-origin worker API stays network-only (offline queue handles offline).
- [x] `manifest.webmanifest` (in `frontend/public/`) — `name` = "Peña Nevada Chillers",
      `short_name` = "Peña Nevada", `display: standalone`, `start_url: "/"`,
      `background_color: "#FFFFFF"`, `theme_color: "#243345"` (navy-800), 4 icon entries (any + maskable).
- [x] `index.html` — manifest link, `theme-color` meta (`#243345`), `apple-touch-icon`, iOS web-app metas.
- [x] `angular.json` — set `"serviceWorker": "ngsw-config.json"` on the build target (the application builder
      takes a config **path**, not a boolean). **Also added the `public` glob to build `assets`** — it was
      missing, so `public/` (favicon, manifest, icons) was not being deployed. Now it is.
- [x] **Verified:** production build emits `ngsw-worker.js` + `ngsw.json` (49 precached files, manifest + 5 icons), manifest, favicon, and `/icons/*` into `dist/manttio/browser`.
- [x] **Icons — DONE.** Generated from `website/public/brand/penanevada-mark.png` (the circular
      "Peña Nevada Chillers" badge) onto a white canvas (iOS renders transparency as black, so all
      icons are flattened). Output in `frontend/public/icons/`:
  - `icon-192.png`, `icon-512.png` — purpose `"any"` (near full-bleed badge).
  - `icon-maskable-192.png`, `icon-maskable-512.png` — purpose `"maskable"` (badge padded to ~68%
    so the OS safe-zone crop never clips the navy ring).
  - `apple-touch-icon.png` (180×180) — iOS home screen.
  - Manifest `icons` array should list the four `icon-*` files with matching `sizes`/`type`/`purpose`.
    Regenerate with ImageMagick if the source mark changes.

### Phase 1 — Storage layer (IndexedDB) — ✅ DONE
- [x] Added `dexie@^4.4.2`.
- [x] `frontend/src/offline/pending-report.model.ts` — `PendingReport`, `PendingReportStatus`,
      `PendingReportCreator` types.
- [x] `frontend/src/offline/offline-reports.db.ts` — Dexie subclass `OfflineReportsDb`
      (`manttio-offline`, store `pendingReports: 'tempId, status, createdAt'`; blobs in `fields` stored, not indexed).
- [x] `frontend/src/offline/offline-reports.service.ts` (`providedIn: 'root'`) —
      `enqueue(fields, createdBy)`, `list()` (FIFO), `get(tempId)`, `count()`, `setStatus(tempId, status, err?)`, `remove(tempId)`.

### Phase 2 — NGXS state `OfflineReportsState`
- [ ] `frontend/src/state/offline-reports/` (`.state.ts`, `.actions.ts`) following existing conventions.
- [ ] Actions: `LoadPendingReports`, `QueueOfflineReport(fields)`, `SyncOfflineReports` (all),
      `SyncOfflineReport(tempId)` (single — used by detail page), `DiscardPendingReport(tempId)`.
- [ ] `SyncOfflineReports*` upload **sequentially**, guarded by `uploading`; per report:
      `uploading` → `ReportsService.create(fields)` → success: remove from IDB + slice;
      failure: mark `failed` + keep + record `lastError`.
- [ ] Register `OfflineReportsState` in `app.config.ts`.
- [ ] `provideAppInitializer` → dispatch `LoadPendingReports` on boot (queue survives reloads).

### Phase 3 — Capture point (`report-add.ts` `dispatchCreate`, ~line 343)
- [ ] Branch on `navigator.onLine`: online → `CreateReport` (unchanged);
      offline → `QueueOfflineReport(fields)` (with `createdBy` from `AuthState.user`).
- [ ] React via `ofActionSuccessful(QueueOfflineReport)` (mirrors the `CreateReport` success handler
      at ~line 158): toast *"Reporte guardado sin conexión; se subirá al reconectar"*, clear
      files/signature, `DiscardReportDraft`, navigate to `/reports`. (Per the NGXS Actions-stream rule —
      no `.subscribe()` on dispatch.)

### Phase 4 — Reconnect detection + prompt
- [ ] Root `OfflineSyncService`, initialized via `provideAppInitializer`; binds `window` `online`/`offline`
      listeners (with `DestroyRef`/`takeUntilDestroyed`); exposes an `isOnline` signal.
- [ ] On `online` **and** `pending.length > 0`: `ConfirmationService` dialog →
      accept dispatches `SyncOfflineReports`. PrimeNG `MessageService` toasts for progress/result.

### Phase 5 — UI surfaces
- [ ] **Reports list:** pin the offline-created, not-yet-uploaded reports **at the top**, visually
      emphasized (badge e.g. "Sin conexión / Pendiente", distinct row styling), above the server reports.
      Source: `select(OfflineReportsState.pending)`. Each pending row links to its detail (by `tempId`).
- [ ] **Pending detail route:** add `report/pending/:id` → `ReportDetail` in a "pending mode"
      (server `reports/:id` left untouched). Singular `report/` prefix (matching `report-add`) and the
      dedicated `pending/` segment keep server ids and `tempId`s from ever colliding. The `:id` param
      carries the `tempId`.
- [ ] **Report detail (pending mode):** load the `PendingReport` from `OfflineReportsState`/IndexedDB;
      render read-only (pictures via `URL.createObjectURL` from the stored `Blob`s; **revoke object URLs
      on destroy**; signature likewise). Show an **"Subir"** button → `SyncOfflineReport(tempId)`
      (with the phone-swap confirm if creator ≠ current user); on success navigate to the now-real
      server report (or `/reports`). Also a **"Descartar"** action → `DiscardPendingReport(tempId)`.
- [ ] Pending-count badge (nav / reports header) via a `count` selector.
- [ ] Offline status indicator driven by the `isOnline` signal.

---

## Edge cases handled
- **401 during sync** — the auth interceptor auto-logs-out on 401; the queue lives in IndexedDB so it
  survives logout. Re-prompt to sync after re-login.
- **Partial sync** — per-item success/failure; failures stay queued as `failed` with `lastError`, retriable.
- **Double-sync / connection flapping** — global `uploading` guard + per-item status transitions
  prevent duplicate POSTs.
- **Phone swap** — creator stored at enqueue; mismatch warning at sync (see "Creator attribution").
- **date_arrival** — preserved from field time via persisted `fields`.

## Out of scope (flagged for later)
- Backend `created_by` override for true original-creator attribution (currently token-derived).
- Image compression before queueing (helps IndexedDB footprint with many large photos) — additive.
- Background auto-sync via the Background Sync API — we use the `online` event + manual triggers.

---

## Conventions to honor (from frontend/CLAUDE.md + memory)
- `inject()` DI, `@if/@for/@switch`, signals + computed, Reactive Forms.
- Read NGXS via top-level `select(...)`, not `this.store.selectSignal(...)`.
- React to actions via `Actions` + `ofActionSuccessful`/`ofActionErrored` + `takeUntilDestroyed()` —
  never `store.dispatch(action).subscribe(...)`.
- PrimeNG `MessageService` / `ConfirmationService` only — no Swal, no `alert()`.
- Tailwind 3.4, `gap-*` over margins, no inline styles, shared palette tokens.
