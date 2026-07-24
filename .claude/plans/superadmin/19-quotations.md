# 19 — Quotations (cotizaciones)

> **Status:** planned · **Depends on:** 07 (client + contacts), 17 (catalog + `taxable`), `email/` + `pdf/` modules · **Feeds:** 18 (an accepted quotation generates a service order) · **Hooks:** 08 (CRM interaction), 09 (billing)
> **Owner:** — · **Last updated:** 2026-07-24

The **sales entry point** and the convergence of 17 and 18: a quotation is built from
catalog services (17), mailed to the client's contacts (07), and — when a contact accepts
through a **token-guarded page** — **generates a service order** (18). Price/uom/qty are
**frozen at creation** (a quote is a commitment); every step is audited on the quotation's
own timeline.

```
services (17) ──feeds──▶ QUOTATION (draft → sent → accepted) ──generates──▶ service_order (18) ──▶ visits/reports
                                        │
                                        └─ mailed to customer_contacts (07) → token page → accept/decline
```

## 1. Data model (DTO view)

```
Quotation {
  id,                       // uuid PK
  folio,                    // 'COT-YYYYMMDD-NNNN', unique — own daily counters
                            //   (quotation_counters, report_counters mechanics)
  customerId,               // required, restrict, never cascade
  status: 'draft' | 'sent' | 'accepted' | 'declined'
        | 'expired' | 'cancelled' | 'superseded',
  validUntil,               // date — expiry (auto-expire past it, §4)
  ivaRate,                  // numeric SNAPSHOT at creation (default 0.16) — §3
  comments?,                // terms / conditions (mutable in draft only)
  supersedesQuotationId?,   // revision chain: this quote replaces a prior one
                            //   (decided 2026-07-24 — new linked quotation, not
                            //   in-place versioning)
  createdBy, createdAt, updatedAt, deletedAt,   // soft delete only
  // resolution (per-reviewer detail lives on QuotationRecipient):
  sentAt?,
  acceptedAt?,              // when the quote reached 'accepted' (reviewer rule, §2)
  declinedAt?,             // when a reviewer declined, or staff declined
  resolvedByUserId?,       // set when a staff user resolved it manually (phone)
  serviceOrderId?,         // the order generated on accept (18) — the convergence
}
QuotationLine {             // FROZEN snapshot — the quote never re-reads the catalog
  id, quotationId,
  serviceId,                // ref → services (restrict; the service may later be
                            //   renamed/soft-deleted — the snapshot stays intact)
  serviceName,              // snapshot of services.name at creation
  description?,             // snapshot (or a per-line override)
  unitPrice,                // numeric(12,2) SNAPSHOT of services.price
  uom,                      // snapshot of services.uom
  quantity,                 // int >= 1
  taxable,                  // boolean SNAPSHOT of services.taxable (§3)
  // lineSubtotal = unitPrice * quantity (computed; not stored)
  createdAt
}
QuotationRecipient {        // one per mailed contact — the token model (§4)
  id, quotationId,
  contactId,                // → customer_contacts (07)
  email,                    // snapshot of the address mailed to
  isReviewer,               // toggle per contact at send time (2026-07-24): a
                            //   reviewer can approve/decline (and their reason is
                            //   recorded); a non-reviewer gets a view-only copy
  token,                    // high-entropy, per-recipient (report-email precedent)
  sentAt, viewedAt?,
  respondedAt?,             // reviewers only
  response?,                // 'approved' | 'declined'
  responseReason?,          // attached to the response — required on decline; so we
                            //   see per reviewer who approved and who didn't, why
}
```

**Snapshot rule (decided 2026-07-24 — the tricky bit).** A quotation line freezes
`serviceName` + `unitPrice` + `uom` + `quantity` + `taxable` at creation. Catalog edits
(17) never rewrite an existing quote, and a soft-deleted service still renders on its old
quotes. When the quote converts to an order (§6), the **order lines inherit these
snapshots** — so the order (and eventually the invoice) charges exactly what the client
accepted.

**Totals** are computed from the frozen lines + `ivaRate`, never stored redundantly:
`subtotal = Σ lineSubtotal`; `ivaBase = Σ lineSubtotal where taxable`;
`iva = ivaBase * ivaRate`; `total = subtotal + iva`.

## 2. Lifecycle & statuses

`draft` → `sent` → (`accepted` | `declined` | `expired`); plus `cancelled` (staff) and
`superseded` (replaced by a revision).

- **Editable only in `draft`** (lines, validUntil, comments). Once `sent` the quote is
  **immutable** — a change means **revise → a new linked quotation** that `supersedes`
  this one (copies the lines into a fresh draft; the old one flips to `superseded`).
- **Expiry (decided 2026-07-24):** past `validUntil` a `sent` quote becomes `expired`
  and the token page refuses acceptance (stale snapshotted prices are a real risk).
  Enforced by a daily cron sweep **and** a guard on the token endpoint.
- **Reviewer approval (decided 2026-07-24).** Recipients are split at send time into
  **reviewers** (a per-contact toggle) and informational recipients (view-only CC). Only
  reviewers can approve/decline, and each reviewer's decision + reason is recorded on
  their `QuotationRecipient` — so staff see **who approved, who didn't, and why**.
- **Resolution rule (lean — open decision below):** the quote reaches `accepted` when
  **every reviewer has approved**; **any reviewer decline** flips it to `declined`
  (carrying that reviewer's reason) and blocks order generation. Staff can also resolve
  manually (`resolvedByUserId`) — e.g. a single reviewer confirmed by phone. The order
  (§6) generates the moment the quote reaches `accepted`.

## 3. Tax — per-service taxable flag (decided 2026-07-24)

`services` (17) gains a `taxable` boolean (default true). Each quotation line snapshots
the service's `taxable` at creation; the quotation snapshots an `ivaRate` (default 0.16,
editable per quote). Only taxable lines enter the IVA base — some services are
exempt/zero-rated. The quotation total is the client-facing indicative figure; the
**formal CFDI/IVA breakdown still happens at invoicing (09)** — the quote total and the
invoice must reconcile because both derive from the same frozen line snapshots.

## 4. Mailing + token-guarded accept/decline

- **Send** picks recipients from the client's `customer_contacts` (07) (+ the customer's
  main email); each row carries an **`isReviewer` toggle** (§2). Each recipient gets a
  `quotation_recipients` row with a high-entropy `token` (the `report_emails` token model
  — `reports/utils/access-token.ts`). The email carries the **cotización PDF** (`pdf/`
  module) + the link.
- **Public token page** — `GET /public/quotations/{token}` renders the quote read-only,
  branded from `/brand` (no auth; JWT-middleware-whitelisted like `/reports/download/`).
  For a **reviewer** token it shows **Aprobar / Rechazar** (decline requires a reason);
  for an informational token it's view-only.
  `POST /public/quotations/{token}/respond { response, reason? }` records the reviewer's
  decision, then re-evaluates the resolution rule (§2). Guards: expired → refuse;
  non-reviewer token → 403; already-responded → show their prior choice; quote already
  resolved → show the outcome. **Host:** a backend-rendered self-contained HTML page
  (lean, matches the report-download precedent) — open decision if a richer SPA page is
  wanted.

## 5. Audit — `quotation_events` (append-only)

The quotation carries its **own timeline** (the pre-sale record), separate from the order
timeline (18 §7, the post-sale record) and linked through `serviceOrderId`. This is the
"audit records for users **and** the quotation record itself." Mirrors
`customer_interactions` / `service_order_events` (append-only, no updates/deletes).

```
QuotationEvent { id, quotationId, type, actorId?, contactId?, refKind?, refId?,
                 changes?, note?, createdAt }
```

- Types: `quotation_created`, `quotation_line_added`, `quotation_sent` (refId →
  recipient/contact, `changes` notes reviewer vs informational), `quotation_viewed`
  (contact via token), `quotation_reviewer_approved` / `quotation_reviewer_declined`
  (per reviewer, `contactId` + reason note — the "who approved / who didn't, why"),
  `quotation_accepted` / `quotation_declined` (the quote-level resolution), 
  `quotation_expired`, `quotation_cancelled`, `quotation_superseded` (refId → the new
  quote), `order_generated` (refId → the order).
- **Attribution:** staff actions carry `actorId` (user); token-page actions carry
  `contactId` (the reviewing contact) with `actorId` null. Every event is written
  **inside the same transaction** as the state change.

## 6. Convergence → service order (18)

On accept, in one transaction: create the service order (18) inheriting the quotation's
**line snapshots** (serviceName/uom/quantity/unitPrice/taxable) — never re-reading the
catalog — set `service_orders.quotationId` + `quotations.serviceOrderId`, append the
quotation's `order_generated` event and the order's opening `order_created`
(`refKind: 'quotation'`). The order then runs its own flow (explode reports per unit,
schedule visits). **Direct orders stay allowed** (18, decided 2026-07-23) with
`quotationId` null — the quote path is primary, not exclusive.

## 7. Roles (extends `14-access-control.md` §2)

| Action | owner | admin | office | technician |
|---|---|---|---|---|
| List / read quotations | ✓ | ✓ | ✓ | — |
| Build / edit draft · send · cancel · revise | ✓ | ✓ | ✓ | — |
| Mark accepted / declined manually (phone) | ✓ | ✓ | ✓ | — |
| Approve / decline via token page | **reviewer** client contacts only (public, token-scoped) |

## 8. Pages & components

- `quotations/pages/quotations-list/` — p-table (folio `font-data`, cliente, status pill,
  total `font-data`, vigencia, creada), URL filters (`q`/`customer`/`status`).
- `quotations/pages/quotation-builder/` — **dedicated builder page** (same call as 18's
  order builder): client select → lines builder (service select pulls the snapshot
  name/price/uom/taxable, quantity, per-line subtotal; running subtotal / IVA / total),
  validUntil, comments. Saves as `draft`. Route `/quotations/new`.
- `quotations/pages/quotation-view/` — header (folio, client, status, totals), lines,
  **recipients card** (each contact + reviewer badge + viewed/approved/declined pill +
  reason), **activity timeline** (§5), actions (Enviar, Cancelar, Revisar→nueva, marcar
  aceptada/rechazada).
- `quotations/components/send-quotation-dialog/` — pick client contacts (07), each row
  with a **reviewer toggle** (`p-toggleswitch`/checkbox — only reviewers can
  approve/decline; the rest are informational) + optional message; confirm-heavy ("se
  enviará la cotización a…, N revisores").
- **Public token page** (§4) — branded, standalone.
- Customer view (07): "Cotizaciones" card (07 slot — ask).
- Nav: **Negocio → Cotizaciones** (`module: 'quotations'`, staff only).

## 9. Expected API surface

- `GET /quotations?customerId&status&page&limit` → paged `{ items, total }`
- `GET /quotations/:id` → quote + lines + recipients + computed totals
- `GET /quotations/:id/timeline` → resolved `quotation_events` (§5)
- `POST /quotations` — draft `{ customerId, validUntil, ivaRate?, comments?, lines: [{
  serviceId, quantity, description? }] }` (snapshots resolved server-side from 17)
- `PATCH /quotations/:id` — **draft only** (lines/validUntil/comments); 409 once sent
- `POST /quotations/:id/send` `{ recipients: [{ contactId, isReviewer }], message? }` →
  recipients + tokens, mails PDF + link, status → `sent`
- `POST /quotations/:id/cancel` · `POST /quotations/:id/revise` (→ new linked draft,
  old → `superseded`)
- `POST /quotations/:id/accept` · `/decline` — staff-side manual resolution
- **Public:** `GET /public/quotations/{token}` (view; reviewer tokens get the actions) ·
  `POST /public/quotations/{token}/respond` `{ response, reason? }` — reviewer-only,
  expiry-guarded; re-evaluates the resolution rule (§2), and reaching `accepted`
  generates the order (§6)
- `GET /customers/:id/quotations` — customer-view card (07 ask)

## 10. State

- `QuotationsState`: `items`, `total`, `loading`, `selected`, `query`. Actions:
  `LoadQuotations`, `LoadQuotationDetail`, `CreateQuotation`, `UpdateQuotation`,
  `SendQuotation`, `CancelQuotation`, `ReviseQuotation`, `ResolveQuotation`
  (accept/decline staff-side).
- `src/app/services/http/quotations.service.ts`.

---

## Checkpoints (stacked with the operations suite — 17 → 19 → 18)

### CP-1 — Backend: quotations + convergence
- [ ] `services.taxable` (17 amendment); `quotations` + `quotation_lines` +
      `quotation_recipients` + `quotation_events` + `quotation_counters` tables,
      hand-written additive DDL; `service_orders.quotationId?`
- [ ] CRUD (draft) + `/send` (tokens + email PDF) + `/cancel` + `/revise` + staff
      `/accept` `/decline`; snapshot resolution server-side
- [ ] Public `GET /public/quotations/{token}` + `/respond` (reviewer-only + expiry
      guards); per-reviewer approve/decline → resolution rule (§2); **accept → generate
      order (18) inheriting snapshots**
- [ ] `quotation_events` written in every mutation's transaction; expiry cron sweep

### CP-2 — Superadmin: quotation UI
- [ ] DTOs + `QuotationsState` + http service
- [ ] Builder page (`/new`) + list (URL filters) + view with recipients + timeline
- [ ] Send dialog (contact picker); nav + module keys

### CP-3 — Public token page + PDF
- [ ] Cotización PDF (`pdf/` module, brand-themed); email template
- [ ] Branded token page: view → accept/decline (+ reason); resolved/expired states

### CP-4 — Polish
- [ ] Revise/supersede chain UI; manual accept/decline; dashboard "cotizaciones
      pendientes" card; empty states; build green; manual pass: build → send →
      accept on token page → order appears with matching frozen prices

## Open decisions / asks
- **Decided 2026-07-24:** quotation is the primary (not sole) order-birth path; revisions
  = a new linked quotation (supersede chain), not in-place versioning; `validUntil` +
  auto-expire; tax via per-service `taxable` flag + per-quote `ivaRate`.
- **Reviewer model (decided 2026-07-24):** recipients carry an `isReviewer` toggle; only
  reviewers approve/decline, each response + reason tracked per reviewer. **Open —
  resolution rule:** lean *all reviewers must approve → accepted / any decline blocks*;
  alternatives are *any one approval suffices* or *reviewers advise, staff finalizes*.
  Confirm before CP-1.
- Token page host: backend-rendered self-contained HTML (lean, report-download
  precedent) vs a public SPA route (richer, brand-consistent with the apps) — decide at
  CP-3; leaning backend-rendered.
- Partial acceptance (accept a subset of lines) — **rejected v1**, all-or-nothing; a
  subset means a revised quote.
- Multiple live quotations per client concurrently — **allowed** (competing proposals);
  each resolves independently.
- Quotation PDF (this module) vs the order service-history PDF (18 §7) are **separate**
  client documents — the quote is pre-sale, the handoff is post-service.
- Ask to 09: quote totals are indicative; the CFDI IVA breakdown is authoritative at
  invoicing — both derive from the same frozen line snapshots, must reconcile.
- Ask to 14: `quotations` module row in the matrix.
- Ask to 07: "Cotizaciones" card slot on the customer view.
