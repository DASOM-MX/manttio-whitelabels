# 04 — Reports

> **Status:** not-started · **Depends on:** 02 (CP-3)
> **Owner:** — · **Last updated:** 2026-07-05

Admin-side browser for service reports captured in the field app. Superadmin **reads and
administers** reports; it does not author them (capture stays in `frontend/`). Reports are
the anchor for billing (05: bill-by-report) and material tracking (09: materials consumed
per report).

---

## 1. Data model (DTO view)

```
ReportSummary {
  id, folio?, customerId, customerName,
  technicianId, technicianName,
  serviceDate, status,                  // confirm status enum against backend reports module
  billingStatus?: 'unbilled' | 'billed',   // derived, appears once 05 lands
  hasMaterialTracking?: boolean,           // appears once 09 lands
  createdAt
}
ReportDetail = ReportSummary + {
  details: ReportDetailItem[],          // sections/answers as backend returns them
  signatureUrl?, photos: string[],      // R2 keys
  pdfUrl?
}
```

## 2. Expected API surface

- `GET /reports?page&limit&search&customerId&technicianId&from&to&status` → paged
- `GET /reports/:id`
- `GET /reports/:id/pdf` (existing pdf pipeline)
- `POST /reports/:id/resend-email` *(open decision)*
- `DELETE /reports/:id` with `{ deleteComment }` (soft delete)

## 3. Pages & components

- `reports/pages/reports-list/` — lazy `<p-table>`: folio, client, technician, service
  date, status pill; filters: date range (`<p-datepicker>` range), client select,
  technician select, status. Row: view, PDF, delete.
- `reports/pages/report-view/` — read-only detail: header card (client/tech/date/status),
  `.card-section` per detail group, photo grid, signature image (unstyled in dark mode per
  conventions), PDF download button. Slots reserved for 05 (billing card) and 09
  (materials card) — leave a clearly-marked placeholder region, don't build their UI.
- `reports/components/delete-report-dialog/` — shape-3 dialog, audit comment (reuse the
  delete-dialog pattern; extract a shared base only if 03's agent agrees — record as ask).

## 4. State

- `ReportsState`: `list`, `total`, `loading`, `selected`, `filters`. Actions:
  `LoadReports(query)`, `LoadReport(id)`, `DeleteReport(id, comment)`.
- `src/http/reports.service.ts`.

---

## Checkpoints

### CP-1 — List
- [ ] DTOs + service + `ReportsState`
- [ ] List page with full filter bar + status pills
- [ ] Route + sidebar entry live

### CP-2 — Detail
- [ ] Report view page (cards, photos, signature, PDF link)
- [ ] Placeholder regions for billing (05) + materials (09) marked in template comments
- [ ] Delete dialog + toasts

### CP-3 — Polish
- [ ] Dark-mode audit; empty/loading/error states
- [ ] Build green; manual pass: filter by client + date → open report → download PDF →
      delete

## Open decisions / asks
- Status enum + folio field: confirm against backend `reports` module before CP-1.
- Resend-email action: in or out for v1?
- Shared delete-dialog base component with 03: coordinate, don't duplicate silently.
