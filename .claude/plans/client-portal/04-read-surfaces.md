# client-portal / 04 — Read surfaces

> **Status:** planned (doc) · **Depends on:** 02, 03 · **Feeds:** 05
> **Owner:** — · **Last updated:** 2026-08-28

The four sections a portal user reads: reports, contracts, quotations, service orders. Same
shape every time — a filtered list in the URL, a detail page, a PDF where one exists — so this
file specifies the pattern once and the per-entity differences after it.

---

## 1. The shared pattern

- **List:** `p-table`, server-paginated, `GenericQueryResponse<T>` with a real `total`, filters
  and page mirrored into query params (`queryParamMap` is the single load path). Loading state
  is the table skeleton, not a spinner overlay.
- **Detail:** read-only display rows — **never disabled form controls**. Same `report-view`
  posture the field app and superadmin already use.
- **Empty states** distinguish "nothing here yet" from "nothing matches your filters".
- **Errors** surface the backend message verbatim via `errorMessage(err, fallback)`.
- **Scope** is the token's `customerId` (02 §4); nothing in the UI ever sends a customer id.
- **Grant** gates the route, the nav item and the endpoint. Without it the section does not
  exist for that user.

## 2. What a portal user may see — ask A7

Proposal, per entity, so a customer never sees work in progress that staff have not chosen to
share:

| Entity | Visible | Hidden |
|---|---|---|
| Reports | `finished`, `mailed` | `pending`, `created`, `in-progress` (work not yet done), `cancelled` |
| Contracts | all non-deleted | soft-deleted (early-terminated) contracts |
| Quotations | `waiting_approval`, `partially_approved`, `approved`, `declined`, `order_created` | `draft` (not yet mailed), `cancelled` |
| Service orders | `open`, `completed` | `cancelled` |

Owner sign-off needed on the three hidden-by-default choices — in particular whether a customer
should see a **cancelled** order or quotation at all, or whether their disappearance is worse
than their presence.

## 3. Reportes (`view_reports`)

- **List columns:** folio, date, equipment / site, technician *(ask A13 — do we name the
  technician to the customer? The report PDF already does, so proposal: yes)*, status, PDF.
- **Filters:** date range, equipment, free-text.
- **Detail:** the finished report as the customer received it — the answered template snapshot,
  pictures, signature. Reuses the field app's read-only report view structure, restyled to the
  portal shell.
- **PDF:** `GET /portal/reports/:id/pdf` — the same renderer staff use, brand-driven. Note the
  existing `/reports/download/{token}` mailed-link route stays untouched.
- **Stripped:** internal notes, material/WMS consumption and costs, staff-only report metadata.

## 4. Contratos (`view_contracts`)

- **List columns:** type (`ContractType`, Spanish labels via a pure pipe), folio/name, valid
  from, expiry, derived `ContractValidity` badge (`por_iniciar` / `vigente` / `vencido`),
  file.
- **Filters:** type, validity, date range.
- **Detail:** the metadata block plus a download of the stored document. `ContractFileType` is
  not always a PDF — `docx`/`xls` download rather than preview, and the UI must not promise a
  viewer it does not have.
- **Stripped:** internal commercial notes, the originating order's staff-side fields.

## 5. Cotizaciones (`view_quotations`)

- **List columns:** folio, date, `validUntil` with an overdue marker (computed on read, never
  stored), status badge, total, PDF.
- **Detail:** the line table with the **frozen** snapshot values — description, uom, qty, unit
  price, line total — plus terms and the reviewer tally as the customer's side of it.
- **Decision affordance** appears only with `approve_quotations` and only on a live status —
  see `05-quotation-approval.md`.
- **Stripped:** cost/margin behind any price, staff attribution, `resolutionReason` and other
  staff-terminal metadata, and **the other reviewers' identities beyond what the quote itself
  already discloses** (ask A14 — the tally is "2 de 3 aprobaron"; do we name them?).

## 6. Órdenes de servicio (`view_service_orders`)

- **List columns:** folio, opened date, status, priority *(ask A15 — priority is an internal
  dispatch signal; proposal: hide it from the customer)*, linked quotation folio, count of
  linked reports.
- **Detail:** the order's scope lines, its linked reports (deep-linking into §3 when the user
  also has `view_reports`), its visits as **dates only** — not technician assignment churn —
  and the linked quotation when there is one.
- **Timeline:** the customer does **not** see `service_order_events`. That trail is the staff
  audit; a customer-facing summary of it is a later decision, not a v1 default.
- **Stripped:** costs, margins, technician assignment history, internal notes, WMS reservations.

## 7. Inicio

A landing panel, not a dashboard: the tenant's brand, a short greeting, and one card per
granted section showing a count and the two most recent items. No charts, no KPIs — a customer
portal that opens on analytics is answering a question nobody asked.

## 8. Checkpoints

- [ ] **CP-1** — backend: the four list/detail endpoint pairs, portal DTOs, scope + grant
      tests, visibility rules from §2 applied server-side.
- [ ] **CP-2** — Reportes list + detail + PDF.
- [ ] **CP-3** — Contratos list + detail + download.
- [ ] **CP-4** — Cotizaciones list + detail (read-only; the decision lands in 05).
- [ ] **CP-5** — Órdenes list + detail, cross-links to reports.
- [ ] **CP-6** — Inicio panel + the no-grants empty state.

## 9. Asks raised here

- **A13** — name the technician on a customer-visible report?
- **A14** — name the other reviewers on a quotation, or show only the tally?
- **A15** — expose service-order priority to the customer?
