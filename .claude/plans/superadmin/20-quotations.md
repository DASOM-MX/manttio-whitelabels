# 20 — Quotations (cotizaciones)

> **Status:** CP-1 + CP-2 built (backend + superadmin UI; **`/order` convergence landed 2026-07-27** with 19 CP-1 — see CP-1) · **Depends on:** 07 (client + contacts), 18 (catalog + `taxRate`), `email/` + `pdf/` modules · **Feeds:** 19 (staff create a service order from an approved quote) · **Hooks:** 08 (CRM interaction), 09 (billing)
> **Owner:** — · **Last updated:** 2026-07-31

The **sales entry point** and the convergence of 18 and 19: a quotation is built from
catalog services (18), mailed to the client's reviewer-contacts (07) who approve/decline
through a **token-guarded page**, and — once staff **create an order** from it — **feeds a
service order** (19). Price/uom/qty are **frozen at creation** (a quote is a commitment);
every step is audited on the quotation's own timeline.

```
services (18) ──feeds──▶ QUOTATION (draft → waiting_approval → approved/partially/declined)
                                        │                    └─staff create order──▶ service_order (19) ──▶ visits/reports
                                        └─ mailed to customer_contacts (07) → token page → reviewers approve/decline (mutable)
```

## 1. Data model (DTO view)

```
Quotation {
  id,                       // uuid PK
  folio,                    // 'COT-YYYYMMDD-NNNN', unique — own daily counters
                            //   (quotation_counters, report_counters mechanics)
                            //   Unique index is UNCONDITIONAL since 2026-09-03
                            //   (owner): a deleted quote keeps its folio, so the
                            //   series never reissues a number already sent.
                            //   Reverses the earlier `where deleted_at is null`.
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
  serviceOrderId?,         // set when order_created (19) — the convergence
}
QuotationLine {             // FROZEN snapshot — the quote never re-reads the catalog
  id, quotationId,
  serviceId?,               // ref → services (restrict; the service may later be
                            //   renamed/soft-deleted — the snapshot stays intact).
                            //   NULL = OFF-CATALOG line (decided 2026-07-29): staff
                            //   typed the whole line; name/price/uom/taxRate ARE its
                            //   snapshot, no catalog row to trace back to
  serviceName,              // snapshot of services.name at creation
  description?,             // snapshot (or a per-line override)
  unitPrice,                // numeric(12,2) SNAPSHOT of services.price
  uom,                      // snapshot of services.uom
  quantity,                 // numeric(12,3) > 0 (decided 2026-07-29 — decimal
                            //   quantities: 1.5 h, 12.75 m²); a STRING end-to-end,
                            //   like money, so no JSON float ever touches it
  taxRate,                  // SNAPSHOT of services.taxRate (§3) — Mexican IVA rate
  discountAmount,           // numeric(12,2) ≥ 0, ≤ importe (decided 2026-07-29) —
                            //   frozen AMOUNT, never a %: CFDI's per-concepto
                            //   Descuento is an amount, and freezing it means no
                            //   percent re-rounding can make quote and invoice
                            //   disagree. The builder's % entry converts ONCE.
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
`serviceName` + `unitPrice` + `uom` + `quantity` + `taxRate` at creation. Catalog edits
(18) never rewrite an existing quote, and a soft-deleted service still renders on its old
quotes. When the quote converts to an order (§6), the **order lines inherit these
snapshots** — so the order (and eventually the invoice) charges exactly what the client
accepted.

**Totals** are computed from the frozen lines, never stored redundantly, and mirror
**CFDI 4.0** (revised 2026-07-29 for decimal quantities + discounts): per line,
`importe = round(unitPrice × quantity)` — the ONE rounding a line gets, half-up to the
centavo, needed because cents × thousandths lands between centavos — then
`iva = round((importe − discountAmount) × rate)` per line (rates vary per line; CFDI
rounds per concepto). `subtotal = Σ importe` (pre-discount), `descuento = Σ
discountAmount` (exact amounts, no rounding), `total = subtotal − descuento + iva`.
All arithmetic in scaled integers (cents / quantity-thousandths; the cross product in
BigInt — it can pass 2⁵³), duplicated verbatim in the superadmin preview
(`services/quotations/quotation-totals.service.ts`) — any change lands in both in the
same PR. `iva_0` and `exento` both add 0 but stay distinct for CFDI.

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

## 3. Tax — per-service Mexican IVA rate (decided 2026-07-24)

`services` (18) carries a **`taxRate`** — a Mexican IVA rate enum, **not** a boolean, since
not all services are 16%: `iva_16` (16%, general) | `iva_8` (8%, región fronteriza) |
`iva_0` (0%, tasa cero) | `exento` (exento de IVA). Default `iva_16`. Each quotation line
**snapshots the service's `taxRate`** at creation and **IVA is summed per line** (§1
Totals), so a quote mixing 16% and exento lines is exact. `iva_0` vs `exento` both add 0 but
are kept distinct — CFDI treats them differently (Tasa 0.000000 vs Exento). The quotation
total is the client-facing indicative figure; the **formal CFDI/IVA breakdown still happens
at invoicing (09)** — quote and invoice reconcile because both read the same frozen line
snapshots. **IEPS and IVA/ISR retenciones are the billing/facturación module's job (09)**
(decided 2026-07-24) — computed at invoicing, not at quote/order time; the quote carries only
each line's IVA rate. Model a per-line tax array in 09 if a tenant needs them (still behind
the CFDI deferral, 00 §4).

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
timeline (19 §7, the post-sale record) and linked through `serviceOrderId`. This is the
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

## 6. Convergence → service order (19)

The staff **create-order** action (§2 — gated: ≥1 approval for office, owner/admin can
override from 0 approvals; comment mandatory; blocked past `validUntil`) opens the order
in one transaction: create the service order (19) inheriting the quotation's **line
snapshots** (serviceName/uom/quantity/unitPrice/taxRate) — never re-reading the catalog —
set `quotations.serviceOrderId` (the only link since 2026-09-01), flip the quote to
`order_created`, append the quotation's `quotation_order_created` event and the order's
opening `order_created` (`refKind: 'quotation'`).
The order then runs its own flow (explode reports per unit, schedule visits). **Direct
orders stay allowed** (19, decided 2026-07-23) — no quotation points at them — the quote
path is primary, not exclusive.

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
- `quotations/pages/quotation-builder/` — **dedicated builder page** (same call as 19's
  order builder): client select → lines builder (service select pulls the snapshot
  name/price/uom/taxRate, quantity, per-line subtotal; running subtotal / IVA / total),
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
- `POST /quotations` — draft `{ customerId, validUntil, comments?, lines: [{
  serviceId, quantity, description? }] }` (snapshots — incl. each line's `taxRate` —
  resolved server-side from 18)
- `PATCH /quotations/:id` — **draft only** (lines/validUntil/comments); 409 once sent
- `POST /quotations/:id/send` `{ recipients: [{ contactId, isReviewer }], message? }` →
  recipients + tokens, mails PDF + link, status → `sent`
- `POST /quotations/:id/revise` → new linked `draft`; the old one is **cancelled** with an
  auto-comment referencing the successor (`supersedesQuotationId` on the new)
- `POST /quotations/:id/order` `{ comment, location?, assignments: [{ serviceId,
  technicianId, reportType }] }` — **creates the service order** (§6; body amended
  2026-07-27: the per-service assignments are 19 §2's explosion inputs, one per
  distinct quoted service, coverage-checked). Enforces the gate: 403 for office at
  0 approvals (owner/admin override); 409 past `validUntil`. Comment mandatory →
  `order_created`.
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

## Checkpoints (stacked with the operations suite — 18 → 20 → 19)

### CP-1 — Backend: quotations + convergence
- [x] `services.taxRate` — landed with 18 CP-1. `quotations` + `quotation_lines` +
      `quotation_recipients` + `quotation_events` + `quotation_counters`, hand-written
      additive DDL as `drizzle/migrations/0023_quotations.sql` and applied with
      **`drizzle-kit migrate`** (owner 2026-07-27 — "shouldn't we do this through the
      migrations?"; supersedes the out-of-band `db:push`/hand-apply habit). That run also
      re-synced the tracking table, which was 4 files behind: `0020`–`0022` had been
      applied out-of-band and were re-run as no-ops (all three are guarded). Enum-ish
      columns carry **no CHECK constraints** — the `services` posture (18), not
      `notifications` (0020): the Drizzle model is the single source of truth and the
      tally rewrites `status` too often for a constraint to earn its keep.
- [x] CRUD (draft) + `/send` + `/revise` + `/cancel`; snapshot resolution server-side —
      the client sends only `serviceId` + `quantity`, so a caller can never quote a price
      the catalog never held (asserted).
- [x] ~~**`/order` deferred to 19**~~ — **landed 2026-07-27** (both CP-1s on main;
      owner: "link them"). One transaction: order graph off the frozen line
      snapshots (duplicate-service quote lines **merge** into one order line,
      quantities summed — same-instant snapshots make this lossless), quote
      flipped to `order_created` (guarded on liveness inside the tx, so a
      convert can't race a cancel), `serviceOrderId` + `resolutionReason` +
      both timeline events written. ~~FKs now real both ways (DDL 0027;
      `service_orders.quotationId` + partial unique = one order per quote).~~
      **Superseded 2026-09-01 (owner):** one direction only —
      `quotations.serviceOrderId` carries the FK and a plain
      `quotations_service_order_idx`. **Not unique:** an order may be referenced
      by several quotations, since a rejected quote is followed by another
      against the same order. The birth link is the one quote in
      `order_created`.
      **Body shape amended from the `{ comment }` sketch:** 19 §2's report
      invariants make per-service **`assignments`** (`technicianId` +
      `reportType`) mandatory — the skeletons must be born complete, and the
      quote knows neither. Gates as §7: office needs ≥1 approval, owner/admin
      override from 0 is flagged in the event `changes`; 409 past `validUntil`;
      the ≤50-exploded-reports bound applies (409 `explosion_too_large`).
      A soft-deleted service does NOT block conversion — the client accepted
      the frozen snapshot (asserted in the suite).
- [x] Public `GET /public/quotations/{token}` + `/respond` (reviewer-only, **mutable**,
      `validUntil`-guarded) → **re-derives the tally status**. CP-1 answers JSON; CP-3
      replaces the `GET` with the server-rendered page on the same route, so links already
      mailed keep working.
- [x] `quotation_events` for every mutation incl. per-response re-logs + status-derive +
      mandatory cancel comments. Events are always written **inside** the transaction that
      makes the change, and always as a single multi-row insert — a 20-line quote opens
      with 21 events and awaiting them one at a time would be 21 sequential round trips
      inside the transaction holding the folio counter (owner 2026-07-27: "awaits inside
      for loops are not performant").
- [x] **`DELETE /quotations/:id`** — audited soft delete (owner 2026-07-27, CP-1 review).
      Not in §9's surface; added because the module had a `deleted_at` column and no way
      to use it. Admin-tier only (office can `/cancel`, which is a lifecycle decision the
      client may still see, but not remove a quote from the tenant's lists), mandatory
      `{ deleteComment }`, stamps `deleted_by`, appends a `quotation_deleted` event.
      Allowed from any state — housekeeping, not a lifecycle step — and it also stops
      every recipient token resolving.
- [x] **Timeline ordering is `seq`, never `created_at`** (CP-1 review). Events are written
      in batches and every row in a batch shares one `now()`, so ordering by timestamp
      left ties the planner could return in any order — a trail reporting "line added"
      before "quotation created". `quotation_events.seq` (bigserial) is the insertion
      order and the only sort key; the covering index moved with it.
- [x] `test/quotations.test.ts` — 30 tests, green. Fixtures are tracked by id and
      **soft-deleted** in `afterAll`; the no-hard-delete rule covers fixtures too.

### CP-2 — Superadmin: quotation UI
- [x] DTOs + `QuotationsState` + http service
- [x] Builder page (`/new`, plus `/:id/edit` for drafts) + list (URL filters) + view with
      recipients + timeline
- [x] Send dialog (contact picker); nav + module keys
- [x] Cancel + audited-delete dialogs; customer-view "Cotizaciones" tab backed by the new
      `GET /customers/:id/quotations`

**Not in CP-2, by necessity:** **Crear orden** — `POST /:id/order` does not exist until 19,
so no button is rendered (a button that 404s is worse than none). Lands in CP-4 with the
gate + override.

### CP-3 — Suite (PR-A/B/C, one PR each — decided 2026-07-29)
**PR-A — line model v2 (fullstack)** — [x] built 2026-07-29:
- [x] Per-line **discount as a frozen amount** + builder % quick-entry (converts once);
      `≤ importe` guarded (400 `discount_too_large`; revise clamps instead — a reprice
      below the old discount must not hard-fail a body-less endpoint)
- [x] **Off-catalog lines**: `service_id` nullable; staff-supplied name/price/uom/taxRate
      are the snapshot; catalog lines still reject caller-priced fields (now a 400, no
      longer silently ignored)
- [x] **Decimal quantities** `numeric(12,3)`, string end-to-end, scaled-integer
      arithmetic (BigInt cross product, one half-up rounding per derived figure);
      superadmin totals mirror updated in the same PR; migration `0026`; 38 tests green
**PR-B — approval page + PDF (CP-3 as originally scoped)** — [x] built 2026-07-30:
- [x] Cotización PDF (`quotation-pdf.helpers.ts` composing the `pdf/` toolkit,
      brand-themed via `pdfThemeFromBrand`) — renders discounts, off-catalog lines and
      decimal quantities from day one; **generated per request, never stored** (totals
      are computed, so the document cannot drift from the data). `/send` now attaches
      it (`email/` transport grew `attachments`); `GET /public/quotations/{token}/pdf`
      serves the same document from the page's "Descargar PDF".
- [x] **Backend-rendered** approval page (`templates/quotation-approval-page.html.ts` +
      `helpers/quotation-approval-page.helpers.ts`): view → approve/decline (+ reason);
      answered / overdue / resolved / informational states all say why — no SPA, **no
      scripts at all**: the form posts form-data and is answered with a PRG redirect
      (`?e=` codes render the banner). Refinement over "replaces the GET": the same
      route **content-negotiates** — browsers (`Accept: text/html`) get the page, API
      callers keep the CP-1 JSON — so mailed links upgraded without breaking either.
**PR-C — sales follow-through** — [x] built 2026-07-31:
- [x] Default terms & conditions: `quotation_settings` singleton (migration `0030`),
      `GET`/`PUT /quotations/settings` (read office+, write owner/admin, registered
      before `/:id`), owner/admin "Términos" dialog on the list, prefilled into a blank
      new quote (programmatic set — the dirty guard stays quiet)
- [x] Duplicar — **no endpoint** (order-builder precedent, 19 CP-2b): the view's button
      opens `/quotations/new?from=<id>`; the builder prefills (client editable, past
      validity cleared, lines incl. off-catalog + discounts) and a plain create births
      an independent quote with today's catalog prices
- [x] Reviewer reminder: `POST /:id/remind {contactId}` — same token, "Recordatorio:"
      subject, `quotation_reminder_sent` event; named 409s for informational/answered
      recipients, expired or resolved quotes; per-row bell on the recipients tab
- [x] "Por vencer / vencidas": `due=soon|overdue` (live quotes only — an expired
      cancelled quote is trivia), Vigencia select in the filters popover, URL-persisted
- [x] CRM hook (08): send + reviewer response insert `customer_interactions` `system`
      rows (`refKind: quotation`) **inside the same transaction** as the mutation

### CP-4 — Polish
- [ ] Revise chain UI; Crear orden (comment + gate) / Cancelar (comment) from the view;
      owner/admin override on a fully-declined quote; the seven status pills + approval
      tally; dashboard "cotizaciones pendientes" card; empty states; build green; manual
      pass: build → send → reviewer approves (then flips their mind → status re-derives,
      re-logged) → staff Crear orden → order appears with matching frozen prices; and:
      all-decline → office blocked, owner creates the order

## Open decisions / asks
- ~~**Convergence vs line model v2** (2026-07-29): `/order` refused quotes it could not
  represent with `409 quotation_line_not_convertible`.~~ — **resolved 2026-07-31:** 19
  learned the line model (order line model v2 + `services.is_report_source` + explicit
  report counts, see 19's decisions). Every quote shape now converts; the guard and its
  409 are **retired**, replaced by `422 missing_explosion_inputs` for the one thing that
  is genuinely missing information — a line that explodes reports without a technician
  or report type. The owner call the guard was waiting on ("what does 1.5 h explode
  into?") was answered by separating the money quantity from the job count entirely.
- **Line model v2 (decided 2026-07-29, CP-3 PR-A):** per-line **discounts stored as a
  frozen amount** (CFDI's Descuento; the % is a builder-side helper that converts once —
  supersedes "no discounts"); **off-catalog lines allowed** (`service_id` NULL,
  staff-typed snapshot — supersedes the implicit catalog-only stance); **decimal
  quantities** (`numeric(12,3)`, string end-to-end — supersedes `int >= 1`). Totals
  re-shaped to CFDI 4.0 (§1); IVA base is the per-line net (importe − descuento).
- **Send scope (decided 2026-07-26):** CP-1's `/send` mints the per-recipient tokens,
  moves the status and mails a **branded link email** (markup in
  `quotations/templates/quotation-email.html.ts`, renderer in `helpers/`, dispatched
  through the generic `email/` transport). The **cotización PDF attachment stays CP-3** —
  the two checkpoints contradicted each other on this and the endpoint is honest as
  written rather than a `/send` that sends nothing. **Done 2026-07-30 (PR-B):** `/send`
  attaches the PDF. Delivery is per-recipient and
  `allSettled`: one bad address cannot cancel the rest, the send still commits, and the
  response body names every failure so staff see who did receive it.
- **Re-send (decided 2026-07-26):** `/send` may be called again on any live quote. It
  upserts on `(quotationId, contactId)` and **keeps the existing token**, so a link
  already sitting in someone's inbox never dies; `isReviewer` and the mailed address
  refresh, prior responses are untouched, and `sentAt` records only the first send. The
  tally then re-derives over the **full** reviewer set — adding a reviewer to an
  `approved` quote correctly drops it back to `partially_approved`.
- **Zero reviewers (decided 2026-07-26):** an all-informational send is **allowed** —
  sharing a quote as an FYI with the decision handled offline. Such a quote has nothing
  to tally and rests in `waiting_approval` until staff cancel or convert it. `N = 0`
  therefore resolves to `waiting_approval`, never to a vacuous `approved`.
- **`validUntil` (decided 2026-07-26):** overdue-ness is **computed on read**
  (`isOverdue`), not a stored flag with a daily cron as CP-1 originally worded it. No
  column can go stale, no second `triggers.crons` entry, and the guard is exact the
  instant a quote expires. An expired quote stays **readable** on its token page — only
  the action is refused, because a dead end helps nobody.
- **Decided 2026-07-24:** quotation is the primary (not sole) order-birth path; revisions
  = a new linked `draft` (the old is cancelled referencing the successor); **tax via a
  per-service Mexican IVA rate** (`taxRate`: `iva_16`/`iva_8`/`iva_0`/`exento`), summed per
  line (supersedes the earlier `taxable` boolean + per-quote `ivaRate`). `validUntil` is a
  conversion **guard** (no `expired` status — the seven states are canonical).
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
- Quotation PDF (this module) vs the order service-history PDF (19 §7) are **separate**
  client documents — the quote is pre-sale, the handoff is post-service.
- Ask to 09: quote totals are indicative; the **authoritative CFDI IVA breakdown +
  retenciones (ISR / IVA retenido) compute at invoicing (09)** — both derive from the same
  frozen line snapshots, must reconcile. Retenciones stay out of quote/order scope.
- ~~Ask to 14: `quotations` module row in the matrix.~~ — **done (CP-2):** `quotations`
  module key, owner/admin/office; no technician row at all, not even read. Delete is
  admin-tier, gated in-page.
- ~~Ask to 07: "Cotizaciones" card slot on the customer view.~~ — **done (CP-2):** its own
  tab on the customer view, between Equipos and Servicios, reading
  `GET /customers/:id/quotations` (20 §9). That route is owned by the **quotations**
  module and mounted onto the customers path in `index.ts` — quotations already imports
  customers for the contact check, so putting it in the customers controller would have
  made the two circular.
- **Sending needs a contact row (CP-1 gap, still open).** §4 says recipients are the
  client's `customer_contacts` **"+ the customer's main email"**; only the contacts half
  exists. `quotation_recipients.contact_id` is NOT NULL, and making it nullable would
  collide with the events table's rule that a null `contact_id` means *staff action*.
  **Consequence today: a client with zero contact rows cannot be sent a quote at all** —
  CP-2's send dialog says so explicitly and links to the client rather than failing at the
  API. The likely fix belongs in **07** (backfill a default contact from `customers.email`)
  rather than in 20's schema.
- **A re-send can lower the status (CP-1 behaviour, surfaced in CP-2).** The tally
  re-derives over the full reviewer set, so adding a reviewer to an `approved` quote drops
  it to `partially_approved`. The send dialog warns before it happens.
- **A zero-reviewer quote rests in `waiting_approval` forever** — an all-informational send
  has nothing to tally. The tally pipe renders that as "Sin revisores — envío informativo"
  rather than letting it read as a stalled approval.
