# client-portal / 04 — Read surfaces

> **Status:** planned (doc) · **Depends on:** 02, 03 · **Feeds:** 05
> **Owner:** — · **Last updated:** 2026-08-30

The sections a portal user reads: reports, contracts, quotations, service orders — and, since
A8, the equipment registry. Same shape every time — a filtered list in the URL, a detail page, a PDF where one exists — so this
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

## 2. What a portal user may see (A7, owner 2026-08-30)

**Only what staff deliberately released. Nothing drafted, deleted or archived reaches the
portal** — in any section, without exception.

| Entity | Visible | Never sent to the portal |
|---|---|---|
| Reports | `finished`, `mailed` | `pending`, `created`, `in-progress`, `cancelled`, soft-deleted |
| Contracts | live, non-deleted | soft-deleted / early-terminated |
| Quotations | `waiting_approval`, `partially_approved`, `approved`, `declined`, `order_created` | `draft`, `cancelled`, soft-deleted |
| Service orders | `open`, `completed` | `cancelled`, soft-deleted |
| Equipment | active registry rows | soft-deleted units |

Two consequences worth stating once, because both are easy to get wrong later:

1. **The filter is a `WHERE`, not a UI concern.** A hidden record is absent from the response
   body and 404s on direct access, per the omit-never-hide rule (02 §5).
2. **A record can vanish from the customer's view.** Cancelling a quotation the customer has
   already seen removes it from their list. That is the accepted behaviour — a cancelled
   document is one the tenant has retracted, and leaving it visible invites a customer to act on
   something staff consider dead. The `quotation_events` trail keeps the history staff-side.

## 3. Reportes (`view_reports`)

- **List columns:** folio, date, equipment / site, **technician (A13 — always named)**, status,
  PDF. The report PDF the customer already receives names them, so withholding it in the portal
  would be a difference without a reason.
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
- **Reviewers are named (A14, owner 2026-08-30)** — not just the tally. The detail page lists
  every reviewer recipient with their answer and when they gave it: *"María López — aprobó, 12
  ago"*, *"Juan Pérez — pendiente"*. The customer's own people are deciding on the customer's
  own purchase; who has answered is exactly the information that unblocks it. **Informational
  (non-reviewer) recipients are not listed** — they hold no decision, and listing them would
  turn the panel into a distribution log.
- **Stripped:** cost/margin behind any price, staff attribution (who priced it),
  `resolutionReason` and other staff-terminal metadata.

## 6. Órdenes de servicio (`view_service_orders`)

- **List columns:** folio, opened date, status, linked quotation folio, count of linked
  reports. **No priority column (A15)** — it is an internal dispatch signal, and exposing it
  invites an argument about it.
- **Detail:** the order's scope lines, its linked reports (deep-linking into §3 when the user
  also has `view_reports`), its visits as **dates only** — not technician assignment churn —
  and the linked quotation when there is one.
- **Timeline:** the customer does **not** see `service_order_events`. That trail is the staff
  audit; a customer-facing summary of it is a later decision, not a v1 default.
- **Stripped:** costs, margins, **priority**, technician assignment history, internal notes,
  WMS reservations.

## 7. Equipos (`create_service_requests`) — A8

The customer's own equipment registry (module 11), as **both** a browsable section and the
picker inside the request form. One endpoint (`GET /portal/equipment`, 02 §3) serves both.

- **List columns:** tag / name, brand + model, serial, location/site, last service date.
- **Filters:** free text, location.
- **Detail:** the identification block, plus that unit's **reports** (when the user holds
  `view_reports`) and **its service requests**, newest first — the per-unit history that makes
  the section worth having.
- **Action:** "Solicitar servicio para este equipo" deep-links into the request form with the
  unit preselected.
- **Stripped:** acquisition cost, internal maintenance scheduling, WMS parts data.

**Consequence of A1 + A8 taken together:** the approved six-grant list has no `view_equipment`,
so this section is gated by `create_service_requests` — a portal user who may not file requests
sees no equipment either. That follows from both answers as given; making the registry readable
on its own would take a seventh grant.

## 8. Inicio

A landing panel, not a dashboard: the tenant's brand, a short greeting, and one card per
granted section showing a count and the two most recent items. No charts, no KPIs — a customer
portal that opens on analytics is answering a question nobody asked.

## 8. Checkpoints

- [ ] **CP-1** — backend: the list/detail endpoint pairs, portal DTOs, scope + grant tests,
      visibility rules from §2 applied server-side as `WHERE` clauses.
- [ ] **CP-2** — Reportes list + detail + PDF.
- [ ] **CP-3** — Contratos list + detail + download.
- [ ] **CP-4** — Cotizaciones list + detail (read-only; the decision lands in 05).
- [ ] **CP-5** — Órdenes list + detail, cross-links to reports.
- [ ] **CP-6** — Equipos list + detail + per-unit history + the deep-link into the request form.
- [ ] **CP-7** — Inicio panel + the no-grants empty state.

## 9. Asks

All resolved 2026-08-30 — **A7** (released records only), **A8** (section *and* picker),
**A13** (name the technician), **A14** (name the reviewers), **A15** (no priority). See
00 §4.
