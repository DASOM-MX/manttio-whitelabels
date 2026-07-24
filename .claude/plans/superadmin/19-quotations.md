# 19 — Quotations (cotizaciones)

> **Status:** planned · **Depends on:** 07 (client + contacts), 17 (catalog + `taxable`), `email/` + `pdf/` modules · **Feeds:** 18 (staff create a service order from an approved quote) · **Hooks:** 08 (CRM interaction), 09 (billing)
> **Owner:** — · **Last updated:** 2026-07-24

The **sales entry point** and the convergence of 17 and 18: a quotation is built from
catalog services (17), mailed to the client's reviewer-contacts (07) who approve/decline
through a **token-guarded page**, and — once staff **create an order** from it — **feeds a
service order** (18). Price/uom/qty are **frozen at creation** (a quote is a commitment);
every step is audited on the quotation's own timeline.

```
services (17) ──feeds──▶ QUOTATION (draft → waiting_approval → approved/partially/declined)
                                        │                    └─staff create order──▶ service_order (18) ──▶ visits/reports
                                        └─ mailed to customer_contacts (07) → token page → reviewers approve/decline (mutable)
```

## 1. Data model (DTO view)

```
Quotation {
  id,                       // uuid PK
  folio,                    // 'COT-YYYYMMDD-NNNN', unique — own daily counters
                            //   (quotation_counters, report_counters mechanics)
  customerId,               // required, restrict, never cascade
  status: 'draft' | 'waiting_approval' | 'approved' | 'partially_approved'
        | 'declined' | 'cancelled' | 'order_created',
        // draft = created, editable, not yet mailed. On send → waiting_approval.
        // Once sent the status tracks the reviewer tally (auto, mutable, §2):
        //   waiting_approval (0 approvals) · partially_approved (≥1, not all) ·
        //   approved (all) · declined (all red). cancelled + order_created are
        //   EXPLICIT staff actions, each carrying a resolutionReason. A declined
        //   quote is NEVER auto-cancelled.
  validUntil,               // date — expiry (auto-expire past it, §4)
  ivaRate,                  // numeric SNAPSHOT at creation (default 0.16) — §3
  comments?,                // terms / conditions (mutable in draft only)
  supersedesQuotationId?,   // revision chain: this quote replaces a prior one
                            //   (decided 2026-07-24 — new linked quotation, not
                            //   in-place versioning)
  createdBy, createdAt, updatedAt, deletedAt,   // soft delete only
  // draft/waiting/approved/partially/declined are position + tally states; the two
  // explicit terminal actions carry the resolution fields (2026-07-24):
  sentAt?,                 // → waiting_approval
  resolutionReason,        // ALWAYS exists once resolved — the comment on cancel OR
                           //   order_created (mandatory; the audit "why")
  cancelledAt?,            // set on explicit cancel (terminal)
  orderCreatedAt?,         // set on explicit convert → order
  resolvedByUserId?,       // the staff user who cancelled / created the order
  serviceOrderId?,         // set when order_created (18) — the convergence
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

## 2. Lifecycle & statuses (decided 2026-07-24)

Seven states. Five track the quote's position + the reviewer tally (auto, mutable); two
are explicit staff terminal actions with a mandatory `resolutionReason`:

```
draft ──send──▶ waiting_approval ⇄ partially_approved ⇄ approved
                       ⇅                    (reviewer tally, mutable)
                   declined
   any live state ──cancel(comment)──▶ cancelled           [terminal]
   any live state ──create order(comment, gated)──▶ order_created  [terminal]
```

- **`draft`** — created, editable (lines, validUntil, comments), not yet mailed.
- **On send → `waiting_approval`**. From there the status is a **pure function of the
  reviewer tally** (A = #approved, D = #declined, N = #reviewers), recomputed on every
  response: `approved` (A = N) · `declined` (D = N, all red) · `partially_approved`
  (A ≥ 1, not all) · `waiting_approval` (A = 0, not all declined).
- **Reviewers approve/decline — mutable (decided 2026-07-24).** Only reviewers (the
  per-contact toggle) respond; each decision + reason is on their `QuotationRecipient`,
  so staff see **who approved, who didn't, and why**. Reviewers may **change their mind
  mid-flight** — the status re-derives and each change is re-logged (§5). **A decline
  never blocks and a declined quote is NEVER auto-cancelled** — it stays a live state you
  can still convert or leave for minds to change.
- **`order_created` = explicit staff conversion → a service order (§6), gated.**
  **≥1 approval (`approved`/`partially_approved`) → any staff (owner/admin/office)**;
  **0 approvals (`declined` or `waiting_approval`) → owner/admin only** (the override —
  clients change their minds, a denied quote is never a dead end). Carries a mandatory
  **comment** (`resolutionReason`); terminal.
- **`cancelled` = explicit staff abandonment**, mandatory **comment**; terminal. Distinct
  from `declined` (a declined quote is not cancelled).
- **Revise** (any live state) → a new linked `draft` (`supersedesQuotationId` → the old);
  the old one is **cancelled** with an auto-comment referencing the successor (no separate
  `superseded` status — keeps the seven).
- **`validUntil`** is a **guard, not a status** (no `expired` state per the seven):
  past it, the quote can't be converted to an order — **revise for current prices**.
  A daily cron flags overdue quotes for the UI; the `/order` endpoint enforces it.

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
  reviewer's decision, then **re-derives the tally status** (§2) — it never itself
  converts or cancels the quote (staff do, §2). Guards: past `validUntil` → refuse;
  non-reviewer token → 403; quote already `order_created`/`cancelled` → view-only
  outcome. **Host (decided 2026-07-24): the approval page lives in the backend** — a
  self-contained server-rendered HTML page (brand-themed from `/brand`, forms POST to
  `/respond`), the same shape as `/reports/download/`. No SPA route; the client never
  touches an app bundle. It sits in the `quotations/` module (`templates/` markup +
  `helpers/` renderer, per the backend template/helper split), mounted public before the
  JWT middleware.

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
  trail shows who approved / who didn't / who flipped and why), `quotation_status_derived`
  (the tally moved the status, e.g. waiting → partially_approved → approved), 
  `quotation_order_created` (staff, `note` = the mandatory comment; `changes` flags the
  **owner/admin override** when converted at 0 approvals; refId → the order),
  `quotation_cancelled` (staff, `note` = mandatory comment; a revise-cancel notes the
  successor).
- **Attribution:** staff actions carry `actorId` (user); token-page actions carry
  `contactId` (the reviewing contact) with `actorId` null. Every event is written
  **inside the same transaction** as the state change. The order/cancel comment
  (`resolutionReason`) is always present — the audit trail always has the "why".

## 6. Convergence → service order (18)

The staff **create-order** action (§2 — gated: ≥1 approval for office, owner/admin can
override from 0 approvals; comment mandatory; blocked past `validUntil`) opens the order
in one transaction: create the service order (18) inheriting the quotation's **line
snapshots** (serviceName/uom/quantity/unitPrice/taxable) — never re-reading the catalog —
set `service_orders.quotationId` + `quotations.serviceOrderId`, flip the quote to
`order_created`, append the quotation's `quotation_order_created` event and the order's
opening `order_created` (`refKind: 'quotation'`).
The order then runs its own flow (explode reports per unit, schedule visits). **Direct
orders stay allowed** (18, decided 2026-07-23) with `quotationId` null — the quote path
is primary, not exclusive.

## 7. Roles (extends `14-access-control.md` §2)

| Action | owner | admin | office | technician |
|---|---|---|---|---|
| List / read quotations | ✓ | ✓ | ✓ | — |
| Build / edit draft · send · revise · cancel | ✓ | ✓ | ✓ | — |
| **Create order** when ≥1 approval — comment required | ✓ | ✓ | ✓ | — |
| **Create order** from a fully-declined quote (0 approvals) — comment required | ✓ | ✓ | — | — |
| **Cancel** a quote — comment required | ✓ | ✓ | ✓ | — |
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
  Revisar→nueva, **Crear orden** (gated — owner/admin see it even at 0 approvals) and
  **Cancelar** — each opens a confirm dialog that **requires a comentario**
  (`resolutionReason`).
- `quotations/components/send-quotation-dialog/` — pick client contacts (07), each row
  with a **reviewer toggle** (`p-toggleswitch`/checkbox — only reviewers can
  approve/decline; the rest are informational) + optional message; confirm-heavy ("se
  enviará la cotización a…, N revisores").
- **Public approval page (§4) — backend-rendered, NOT a superadmin page** (server HTML in
  the `quotations/` backend module; no Angular). Listed here only for the flow.
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
- `POST /quotations/:id/revise` → new linked `draft`; the old one is **cancelled** with an
  auto-comment referencing the successor (`supersedesQuotationId` on the new)
- `POST /quotations/:id/order` `{ comment }` — **creates the service order** (§6).
  Enforces the gate: 403 for office at 0 approvals (owner/admin override); 409 past
  `validUntil`. Comment mandatory → `order_created`.
- `POST /quotations/:id/cancel` `{ comment }` — explicit abandonment; comment mandatory →
  `cancelled` (terminal).
- **Public:** `GET /public/quotations/{token}` (view; reviewer tokens get the actions) ·
  `POST /public/quotations/{token}/respond` `{ response, reason? }` — reviewer-only,
  `validUntil`-guarded, **mutable** (updates a prior response); records/re-logs the
  decision and re-derives the tally status, but never converts/cancels the quote (§2)
- `GET /customers/:id/quotations` — customer-view card (07 ask)

## 10. State

- `QuotationsState`: `items`, `total`, `loading`, `selected`, `query`. Actions:
  `LoadQuotations`, `LoadQuotationDetail`, `CreateQuotation`, `UpdateQuotation`,
  `SendQuotation`, `CreateOrderFromQuotation(id, comment)`, `CancelQuotation(id,
  comment)`, `ReviseQuotation`. (Reviewer responses arrive server-side via the token
  endpoint; the list/detail re-fetch reflects the re-derived status.)
- `src/app/services/http/quotations.service.ts`.

---

## Checkpoints (stacked with the operations suite — 17 → 19 → 18)

### CP-1 — Backend: quotations + convergence
- [ ] `services.taxable` (17 amendment); `quotations` + `quotation_lines` +
      `quotation_recipients` + `quotation_events` + `quotation_counters` tables,
      hand-written additive DDL; `service_orders.quotationId?`
- [ ] CRUD (draft) + `/send` (tokens + email PDF) + `/revise` + `/order` (comment,
      gated) + `/cancel` (comment); snapshot resolution server-side
- [ ] Public `GET /public/quotations/{token}` + `/respond` (reviewer-only, **mutable**,
      `validUntil`-guarded) → **re-derives the tally status**; `/order` gate (≥1 approval
      for office, owner/admin override from 0) → **opens order (18) inheriting snapshots**
- [ ] `quotation_events` for every mutation incl. per-response re-logs + status-derive +
      mandatory order/cancel comments; `validUntil` cron flag

### CP-2 — Superadmin: quotation UI
- [ ] DTOs + `QuotationsState` + http service
- [ ] Builder page (`/new`) + list (URL filters) + view with recipients + timeline
- [ ] Send dialog (contact picker); nav + module keys

### CP-3 — Backend approval page + PDF
- [ ] Cotización PDF (`pdf/` module, brand-themed); email template
- [ ] **Backend-rendered** approval page (`quotations/templates/` + `helpers/`, public
      route): view → approve/decline (+ reason); overdue/resolved/non-reviewer states —
      no SPA

### CP-4 — Polish
- [ ] Revise chain UI; Crear orden (comment + gate) / Cancelar (comment) from the view;
      owner/admin override on a fully-declined quote; the seven status pills + approval
      tally; dashboard "cotizaciones pendientes" card; empty states; build green; manual
      pass: build → send → reviewer approves (then flips their mind → status re-derives,
      re-logged) → staff Crear orden → order appears with matching frozen prices; and:
      all-decline → office blocked, owner creates the order

## Open decisions / asks
- **Decided 2026-07-24:** quotation is the primary (not sole) order-birth path; revisions
  = a new linked `draft` (the old is cancelled referencing the successor); tax via
  per-service `taxable` flag + per-quote `ivaRate`. `validUntil` is a conversion **guard**
  (no `expired` status — the seven states are canonical).
- **State machine (decided 2026-07-24):** seven states — `draft`, `waiting_approval`,
  `approved`, `partially_approved`, `declined`, `cancelled`, `order_created`. The first
  five are position + reviewer-tally states (auto, mutable); a **declined quote is never
  auto-cancelled**. `cancelled` and `order_created` are explicit staff actions, each
  carrying a mandatory `resolutionReason` that **always exists**.
- **Reviewer + create-order gate (decided 2026-07-24):** recipients carry an `isReviewer`
  toggle; only reviewers approve/decline (mutable, re-logged). **Create order** = staff
  action: **≥1 approval → any staff; 0 approvals → owner/admin only** (override).
- ~~Token page host~~ — **decided 2026-07-24: the approval page lives in the backend**
  (server-rendered self-contained HTML in the `quotations/` module, report-download
  precedent). No public SPA route.
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
