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
  status: 'draft' | 'sent' | 'accepted' | 'closed'
        | 'expired' | 'cancelled' | 'superseded',
        // 'closed' = staff decided not to proceed (reason); reversible.
        // Reviewer decline is NOT a status — it never resolves the quote (§2).
  validUntil,               // date — expiry (auto-expire past it, §4)
  ivaRate,                  // numeric SNAPSHOT at creation (default 0.16) — §3
  comments?,                // terms / conditions (mutable in draft only)
  supersedesQuotationId?,   // revision chain: this quote replaces a prior one
                            //   (decided 2026-07-24 — new linked quotation, not
                            //   in-place versioning)
  createdBy, createdAt, updatedAt, deletedAt,   // soft delete only
  // staff resolution (per-reviewer detail lives on QuotationRecipient). Accept
  // and close each carry a MANDATORY reason for the audit trail (2026-07-24).
  sentAt?,
  acceptedAt?,             // staff accepted → a service order was opened (§6),
                           //   gated by the approval rule (§2)
  closedAt?,               // staff closed (not proceeding) — reversible: a closed
                           //   or fully-declined quote can still be accepted later
                           //   (owner/admin) — clients change their minds
  resolutionReason?,       // REQUIRED on accept and on close
  resolvedByUserId?,       // the staff user who accepted/closed
  serviceOrderId?,         // the order opened on accept (18) — the convergence
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
  respondedAt?,             // reviewers only — the LAST response time. Responses are
                            //   MUTABLE (2026-07-24): a reviewer may change their mind
                            //   mid-flight; each change is re-logged (§5)
  response?,                // 'approved' | 'declined' (current)
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

`draft` → `sent` → (`accepted` | `closed` | `expired`); plus `cancelled` and
`superseded` (replaced by a revision). Reviewer approve/decline is **advisory** and does
not itself move the status.

- **Editable only in `draft`** (lines, validUntil, comments). Once `sent` the quote is
  **immutable** — a change means **revise → a new linked quotation** that `supersedes`
  this one (copies the lines into a fresh draft; the old one flips to `superseded`).
- **Expiry (decided 2026-07-24):** past `validUntil` a `sent` quote becomes `expired`;
  neither reviewers nor staff can accept an expired quote — **revise to a fresh quote**
  for current prices (stale snapshots are the risk). Enforced by a daily cron sweep +
  a guard on both the token and the accept endpoints.
- **Reviewers approve/decline — advisory + mutable (decided 2026-07-24).** Only
  reviewers (the per-contact toggle) can respond; each decision + reason is recorded on
  their `QuotationRecipient`, so staff see **who approved, who didn't, and why**.
  Reviewers may **change their mind mid-flight** (each change re-logged, §5).
  **A decline never blocks the process** — the quote's future doesn't hinge on any
  single client answer.
- **Accept = open the order, staff action, gated (decided 2026-07-24).** A service order
  is opened from the quote by an explicit staff **accept** (not auto on approval). Gate:
  **≥1 reviewer approval → any staff (owner/admin/office)** may accept; **0 approvals
  (fully declined / none approved) → owner/admin only** — the override, because clients
  change their minds and a denied quote is never a dead end. **At least one approval is
  the floor for office; owner/admin can open from zero.** Accept requires a **reason**
  and opens the order (§6).
- **Close = staff decide not to proceed** — also requires a **reason**. Reversible: a
  `closed` (or fully-declined) quote can still be accepted later by owner/admin. Nothing
  here is a hard dead end except `expired`/`cancelled`/`superseded`.

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
  For a **reviewer** token it shows **Aprobar / Rechazar** (decline requires a reason),
  and a reviewer can **come back and change their answer** while the quote is live;
  for an informational token it's view-only.
  `POST /public/quotations/{token}/respond { response, reason? }` records (or updates) the
  reviewer's decision — it never resolves the quote itself (staff accept/close does, §2).
  Guards: expired → refuse; non-reviewer token → 403; quote already `accepted`/`closed`/
  `cancelled` → view-only outcome. **Host:** a backend-rendered self-contained HTML page
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
  (contact via token), `quotation_reviewer_responded` (per reviewer, `contactId` +
  approved/declined + reason note — **one per response, including mind-changes**, so the
  trail shows who approved / who didn't / who flipped and why), `quotation_accepted`
  (staff, `note` = the mandatory reason; `changes` flags the **owner/admin override**
  when accepted with 0 approvals), `quotation_closed` (staff, `note` = mandatory reason),
  `quotation_expired`, `quotation_cancelled`, `quotation_superseded` (refId → the new
  quote), `order_opened` (refId → the order).
- **Attribution:** staff actions carry `actorId` (user); token-page actions carry
  `contactId` (the reviewing contact) with `actorId` null. Every event is written
  **inside the same transaction** as the state change. Accept/close reasons are
  non-optional here — the audit trail always has the "why".

## 6. Convergence → service order (18)

The staff **accept** action (§2 — gated: ≥1 approval for office, owner/admin can override
from 0 approvals; reason mandatory) opens the order in one transaction: create the service
order (18) inheriting the quotation's **line snapshots**
(serviceName/uom/quantity/unitPrice/taxable) — never re-reading the catalog — set
`service_orders.quotationId` + `quotations.serviceOrderId`, append the quotation's
`order_opened` event and the order's opening `order_created` (`refKind: 'quotation'`).
The order then runs its own flow (explode reports per unit, schedule visits). **Direct
orders stay allowed** (18, decided 2026-07-23) with `quotationId` null — the quote path
is primary, not exclusive.

## 7. Roles (extends `14-access-control.md` §2)

| Action | owner | admin | office | technician |
|---|---|---|---|---|
| List / read quotations | ✓ | ✓ | ✓ | — |
| Build / edit draft · send · revise · cancel | ✓ | ✓ | ✓ | — |
| **Accept** (open order) when ≥1 approval — reason required | ✓ | ✓ | ✓ | — |
| **Accept** a fully-declined quote (0 approvals) — reason required | ✓ | ✓ | — | — |
| **Close** a quote — reason required | ✓ | ✓ | ✓ | — |
| Approve / decline via token page (mutable) | **reviewer** client contacts only (public, token-scoped) |

## 8. Pages & components

- `quotations/pages/quotations-list/` — p-table (folio `font-data`, cliente, status pill,
  total `font-data`, vigencia, creada), URL filters (`q`/`customer`/`status`).
- `quotations/pages/quotation-builder/` — **dedicated builder page** (same call as 18's
  order builder): client select → lines builder (service select pulls the snapshot
  name/price/uom/taxable, quantity, per-line subtotal; running subtotal / IVA / total),
  validUntil, comments. Saves as `draft`. Route `/quotations/new`.
- `quotations/pages/quotation-view/` — header (folio, client, status, totals, approval
  tally e.g. "2/3 aprobaron"), lines, **recipients card** (each contact + reviewer badge
  + viewed/approved/declined pill + reason), **activity timeline** (§5), actions: Enviar,
  Revisar→nueva, and the reason-gated **Aceptar** (opens the order; owner/admin see it
  even at 0 approvals) / **Cerrar** / Cancelar — each opens a confirm dialog that
  **requires a motivo**.
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
- `POST /quotations/:id/cancel` `{ reason }` · `POST /quotations/:id/revise` (→ new linked
  draft, old → `superseded`)
- `POST /quotations/:id/accept` `{ reason }` — **opens the order** (§6). Enforces the
  gate: 403 for office when 0 approvals (owner/admin override); 409 if expired. Reason
  mandatory.
- `POST /quotations/:id/close` `{ reason }` — staff decide not to proceed; reason
  mandatory; reversible (a later accept still allowed per the gate).
- **Public:** `GET /public/quotations/{token}` (view; reviewer tokens get the actions) ·
  `POST /public/quotations/{token}/respond` `{ response, reason? }` — reviewer-only,
  expiry-guarded, **mutable** (updates a prior response); records/re-logs the reviewer's
  decision but never resolves the quote (staff accept/close does, §2)
- `GET /customers/:id/quotations` — customer-view card (07 ask)

## 10. State

- `QuotationsState`: `items`, `total`, `loading`, `selected`, `query`. Actions:
  `LoadQuotations`, `LoadQuotationDetail`, `CreateQuotation`, `UpdateQuotation`,
  `SendQuotation`, `AcceptQuotation(id, reason)` (opens order), `CloseQuotation(id,
  reason)`, `CancelQuotation(id, reason)`, `ReviseQuotation`.
- `src/app/services/http/quotations.service.ts`.

---

## Checkpoints (stacked with the operations suite — 17 → 19 → 18)

### CP-1 — Backend: quotations + convergence
- [ ] `services.taxable` (17 amendment); `quotations` + `quotation_lines` +
      `quotation_recipients` + `quotation_events` + `quotation_counters` tables,
      hand-written additive DDL; `service_orders.quotationId?`
- [ ] CRUD (draft) + `/send` (tokens + email PDF) + `/cancel` + `/revise` + staff
      `/accept` (reason, gated) + `/close` (reason); snapshot resolution server-side
- [ ] Public `GET /public/quotations/{token}` + `/respond` (reviewer-only, **mutable**,
      expiry-guarded); accept gate (≥1 approval for office, owner/admin override from 0);
      **accept → open order (18) inheriting snapshots**
- [ ] `quotation_events` for every mutation incl. per-response re-logs + mandatory
      accept/close reasons; expiry cron sweep

### CP-2 — Superadmin: quotation UI
- [ ] DTOs + `QuotationsState` + http service
- [ ] Builder page (`/new`) + list (URL filters) + view with recipients + timeline
- [ ] Send dialog (contact picker); nav + module keys

### CP-3 — Public token page + PDF
- [ ] Cotización PDF (`pdf/` module, brand-themed); email template
- [ ] Branded token page: view → accept/decline (+ reason); resolved/expired states

### CP-4 — Polish
- [ ] Revise/supersede chain UI; accept (with reason + gate) / close (with reason) from
      the view; owner/admin override on a fully-declined quote; dashboard "cotizaciones
      pendientes" card; empty states; build green; manual pass: build → send → reviewer
      approves (then flips their mind, re-logged) → staff accept → order appears with
      matching frozen prices; and: all-decline → office blocked, owner opens the order

## Open decisions / asks
- **Decided 2026-07-24:** quotation is the primary (not sole) order-birth path; revisions
  = a new linked quotation (supersede chain), not in-place versioning; `validUntil` +
  auto-expire; tax via per-service `taxable` flag + per-quote `ivaRate`.
- **Reviewer model + resolution rule (decided 2026-07-24):** recipients carry an
  `isReviewer` toggle; only reviewers approve/decline (mutable — they can change their
  mind mid-flight, each change re-logged). Responses are **advisory** and a decline
  **never blocks**. **Opening the order is a staff `accept`** (reason required):
  **≥1 reviewer approval → any staff; 0 approvals (fully declined) → owner/admin only**
  (override — clients change their minds). Staff `close` (reason required) is the
  not-proceeding path and is reversible. **Both accept and close carry a mandatory reason
  for the audit trail.**
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
