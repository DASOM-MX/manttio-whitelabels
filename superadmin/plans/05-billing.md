# 05 — Billing (+ billing by reports)

> **Status:** not-started · **Depends on:** 02 (CP-3), 04 (CP-1), 06 (CP-1)
> **Owner:** — · **Last updated:** 2026-07-05

Internal billing records per client, with line items generated **from reports**
(bill-by-report). v1 tracks money owed/paid inside the product; **CFDI stamping via a PAC
is deferred indefinitely** (master plan §4, decided 2026-07-05 — no invoice generation
until way later). The only obligation now: don't paint the data model into a corner.

---

## 1. Data model (DTO view)

```
Bill {
  id, folio,                            // internal consecutive, per tenant
  customerId, customerName,
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled',
  issueDate, dueDate?,
  subtotal, taxRate,                    // default 16% IVA, editable per bill
  taxAmount, total,                     // computed server-side, echoed to UI
  currency: 'MXN',                      // fixed v1
  notes?,
  items: BillItem[],
  createdAt, updatedAt, deletedAt?
}
BillItem {
  id, billId,
  reportId?,                            // ← bill-by-report link; null for manual lines
  description, quantity, unitPrice, amount
}
```

Rules:
- **Role gating** (`10-access-control.md` §2, decided 2026-07-05): **office creates/edits
  drafts** (incl. the bill-by-report picker); `send` / `mark paid` / `cancel` render only
  for owner/admin (`hasRole` `@if`s on the status action buttons). Backend enforces.
- A report can appear on **at most one non-cancelled bill** (backend enforces; UI filters
  already-billed reports out of the picker).
- `status` transitions: draft → sent → paid; draft/sent → cancelled; overdue is
  derived (`sent && dueDate < today`) — display-only, not stored (confirm w/ backend).
- Fiscal data (RFC etc.) lives on the **client** (module 06); a bill snapshots nothing in
  v1 — when CFDI lands, stamping will snapshot fiscal data per invoice (future).

## 2. Expected API surface

- `GET /bills?page&limit&customerId&status&from&to` → paged
- `GET /bills/:id`
- `POST /bills` (customerId + items, incl. report-linked items)
- `PATCH /bills/:id` (draft only) · `POST /bills/:id/status` (`sent`/`paid`/`cancelled`)
- `DELETE /bills/:id` (draft only, soft)
- `GET /reports/billable?customerId&from&to` — unbilled reports for the picker

## 3. Pages & components

- `billing/pages/bills-list/` — lazy table: folio, client, status pill, issue date, total.
  Filters: client, status, date range. Row: view/edit.
- `billing/pages/bill-form/` — create/edit (draft only):
  1. client select (from 06)
  2. **report picker**: `billing/components/billable-reports-dialog/` (shape 3) — multi-
     select table of that client's unbilled reports; selection materializes `BillItem`s
     (description defaulted from report folio + service date, price editable)
  3. manual line items (FormArray) + tax rate; totals recomputed live (`computed`)
- `billing/pages/bill-view/` — read-only + status action buttons (send/mark paid/cancel via
  `ConfirmationService`).
- Report-side: 04's placeholder region gets a small "Billing" card (bill folio + status
  pill, link to bill) — implemented by **this** module's agent inside the reserved slot.

## 4. State

- `BillingState`: `list`, `total`, `loading`, `selected`, `billableReports`. Actions:
  `LoadBills`, `LoadBill`, `CreateBill`, `UpdateBill`, `SetBillStatus`, `DeleteBill`,
  `LoadBillableReports(customerId)`.
- `src/http/billing.service.ts`.

---

## Checkpoints

### CP-1 — Read path
- [ ] DTOs + service + `BillingState` (list/detail)
- [ ] Bills list page + filters + status pills
- [ ] Bill view page with status actions (wired, may hit mocks)

### CP-2 — Create/edit + bill-by-report
- [ ] Bill form with FormArray items + live totals
- [ ] Billable-reports picker dialog (multi-select → items)
- [ ] Draft-only edit/delete guards in UI
- [ ] Role gating: status actions owner/admin-only; office sees draft flows only

### CP-3 — Integration + polish
- [ ] Billing card in 04's report-view slot
- [ ] Client's bills tab/section link from 06 detail (coordinate ask with 06)
- [ ] Dark-mode audit; empty/loading/error states
- [ ] Build green; manual pass: pick client → pick 2 reports → add manual line → send →
      mark paid; verify report shows billed

## Open decisions / asks
- Overdue: derived vs stored — confirm with backend.
- Folio format (per-tenant consecutive) — backend decision, UI displays as-is.
- ~~Future CFDI: PAC choice + stamp-time field freezing~~ — **deferred indefinitely
  (2026-07-05)**. No PAC evaluation, no stamping UI, nothing CFDI-shaped in v1 beyond
  keeping `Bill` extensible and capturing fiscal data on clients (06).
