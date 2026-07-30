# 19 — Service orders

> **Status:** CP-1 merged (#107) · CP-2 built on `feature/superadmin-service-orders-ui` (PR open) · CP-2b planned 2026-07-29 · **Depends on:** 07 (client), 18 (catalog ✓ landed #102–#105), 20 (born from accepted quotations — *not yet built*), 06 (report explosion), 12 (visits — *not on main*) · **Hooks:** 08 (timeline), 09 (billing), 13 (contracts likely generate orders — ask)
> **Owner:** — · **Last updated:** 2026-07-29

The **commercial job**: what was sold to whom, and everything operational that hangs
off it. One order composes 1..n catalog services (18) for one client, **owns 1..n
scheduled visits** (12 — when we go) and **0..n reports** (06 — what happened).
Creating an order also announces itself on the client's CRM timeline (08).

> **Born from quotations (decided 2026-07-24).** The primary way an order is created is
> by **accepting a quotation (20)** — the order inherits the quote's frozen line
> snapshots (name/uom/qty/unitPrice/taxRate), so what's serviced/billed matches exactly
> what the client approved. `quotationId` links back to the source. **Direct order
> creation stays allowed** (`quotationId` null) for walk-in/emergency jobs. The
> order-builder page (§5) is the direct path; the quote path auto-generates on accept.

> **CP-1 builds standalone — no cross-module coupling yet (decided 2026-07-26).** Orders
> and quotations (20) are being built in parallel, so **CP-1 ships against `main` with no
> link to either 20 or 12**:
> - ~~**No `quotationId` column in CP-1.**~~ **Linked 2026-07-27** (both CP-1s on
>   main): `quotationId` + FK + one-order-per-quote unique landed with 20's
>   `POST /quotations/:id/order` (DDL 0027). Both birth routes live — the §5
>   builder direct path and the quote conversion.
> - **CP-1 does not touch `scheduled_visits`.** The visits backend (12) is *not on main* —
>   PR #97 was **closed unmerged**, so there is no `visit_events` table to rip out and no
>   table to add `serviceOrderId` to. The calendar module gets rebuilt in CP-3 **already
>   order-bound and already writing to `service_order_events`** — the "visit-audit
>   relocation" step is therefore obsolete, not deferred.
> - **The `service_order_events` type enum ships complete in CP-1**, visit\_\* members
>   included (§7). The enum is final from day one; the visit\_\* values simply have no
>   writer until 12 returns.

> **Packaging (decided 2026-07-23).** Orders/services/calendar form the **operations
> suite**; **reporting (06) sells separately**. So the dependency is one-directional:
> 19 enriches 06 (explosion, template↔service prefilter) but **06 never depends on 19**
> — reports work fully standalone with `serviceOrderId` null (06 standalone-suite rule).
> Visits (12) *do* require an order, but that's fine: a reporting-only tenant simply
> doesn't run the calendar/orders modules at all. The manager's org-level module flags
> gate which suite a tenant gets (`14-access-control.md` — flags are manager-owned).

```
customers 1 ─── * service_orders 1 ─┬─ * service_order_services * ─── 1 services
                                    ├─ * scheduled_visits   (12 — NOT NULL, order-bound)
                                    ├─ * reports            (06 — exploded + later links)
                                    ├─ * service_order_events  (§7 — the audit trail)
                                    └─ 0..n contracts       (13 — order MAY generate them; FK on contract)
report_templates * ─── 1 services   (06 §5 — fill-time picker prefilter)
customer_interactions ← system entry on order creation (08)
```

The **service order is the audit aggregate root** (decided 2026-07-23): every event
across the order and its children — lines, visits, reports — appends to one
`service_order_events` timeline (§7). There is **no per-child audit table** (this
supersedes the visit-level `visit_events` in 12 / PR #97). That single consolidated
history is what gets **handed to the client at the end of the service**.

## 1. Data model (DTO view)

```
ServiceOrder {             // near-immutable — see mutability rules below
  id,                      // uuid PK (decided 2026-07-23 — folio is display-only)
  folio,                   // 'OS-YYYYMMDD-NNNN', unique — own daily counters
                           //   table (service_order_counters, report_counters
                           //   mechanics)
  customerId,              // required, immutable — restrict, never cascade
  quotationId?,            // landed 2026-07-27 with 20's /order — the accepted
                           //   quotation this order was born from; null for
                           //   directly-created orders (both paths allowed,
                           //   2026-07-24). Immutable; unique among non-null
                           //   (one order per quote, ever).
  location?,               // service site/address (free text v1) — MUTABLE, but
                           //   owner/admin only (decided 2026-07-23)
  priority,                // 'normal' | 'urgent' (CP-2b, decided 2026-07-29) —
                           //   MUTABLE, any staff; the dispatch jump-the-queue
                           //   flag. Two levels only, no severity ladder
  promisedDate?,           // date-only "fecha compromiso" (CP-2b, decided
                           //   2026-07-29) — MUTABLE, any staff; drives the
                           //   `overdue` list filter
  status: 'open' | 'completed' | 'cancelled',
  comments?,               // freely-mutable (staff; decided 2026-07-23) — the
                           //   commercial core is fixed at creation
  createdBy, createdAt, updatedAt   // deletedAt: soft delete only. Contracts link via
                           //   contracts.serviceOrderId (0..n, 13 §1) — no contractId here
}
ServiceOrderLine {         // table: service_order_services
  id, serviceOrderId, serviceId,
  serviceName, uom, taxRate,  // SNAPSHOT — inherited from the quotation line when
                           //   born from a quote (20), else captured from the
                           //   catalog on direct creation; keeps order ↔ quote ↔
                           //   invoice aligned
  quantity,                // int >= 1, default 1 — explodes `quantity` reports
                           //   (one per unit, decided 2026-07-23)
  unitPrice,               // numeric(12,2) SNAPSHOT (same source as above) —
                           //   catalog edits never rewrite history
  // explosion inputs (decided 2026-07-23 — invariants kept): the create flow
  //   captures technicianId + reportType per line; the `quantity` exploded
  //   reports inherit them and are each individually reassignable afterward
  createdAt                // unique (serviceOrderId, serviceId)
}
```

**Mutability (decided 2026-07-23; extended 2026-07-29, CP-2b).** The **commercial
core** — customer, lines, money, folio, status-by-endpoint — is immutable through
`PATCH`, forever. The **logistics metadata** is editable: `comments` (any staff),
`location` (**owner/admin only** — it's where the crew gets sent), and from CP-2b
`priority` + `promisedDate` (any staff — dispatch escalation and promise
rescheduling are office work). Every mutation appends its own event to the order
timeline (§7). **And only while `open` (decided 2026-07-29, CP-1 review):** at
complete/cancel even the mutable fields freeze — a closed order is history and
the handoff document (CP-5) has already composed from it. `PATCH` on a closed
order is a 409 `order_closed`, matching the UI, which only offers Editar on open
orders.

**Contracts — orders generate them, 0..n (direction decided 2026-07-23; model settled
2026-07-24).** An order **may generate 0..n contracts** (13) — a guarantee, a
programmed-maintenance agreement, a rental/sale doc — each a **stored signed document**
with typed metadata. The link lives on the contract (`contracts.serviceOrderId`), not a
`contractId` on the order; a contract is never a prerequisite for an order and **does not
generate visits** (13, reworked 2026-07-24 — a `programmed_maintenance` contract is a
document; future maintenance is new orders). Standalone contracts (no order) are also
allowed. Direction: order → contract, never the reverse.

**Extensions to existing tables (all additive):**

- `scheduled_visits.serviceOrderId` — **NOT NULL**, restrict (decided 2026-07-23:
  strict order-bound; the table is empty pre-release so no backfill). **Not a CP-1
  change (2026-07-26)** — the table doesn't exist on main; 12's rebuild in CP-3 creates
  it order-bound from the start. Ad-hoc
  "visits" that aren't jobs stay CRM `visit` interactions (08); a diagnostic visit
  is a small order.
- `reports.serviceOrderId?` (nullable **by design** — reports never require an order;
  reporting is a standalone sellable suite, 06 standalone-suite rule) +
  `reports.serviceId?` (which line the report fulfills; drives the template
  prefilter). Both restrict. Explosion writes them; the manual report path leaves them
  null and works unchanged.
- `ReportStatus` gains **`pending`** and **`cancelled`** (widen `reports_status_check`):
  `pending` = the exploded not-yet-started state; `cancelled` = an exploded report
  voided when its order is cancelled (decided 2026-07-23). `created` remains the
  manual-report birth status. (06 §amendment.)
- `report_templates.serviceId?` (nullable = generic template) — 06 §5 amendment.
- `InteractionRefKind` gains `ServiceOrder = 'service_order'` (TS-only; the table
  has no ref-kind CHECK).

## 2. Order creation — one transaction

1. Insert `service_orders` (folio from counters) + lines (price snapshot).
2. **Explode reports: one `pending` report per unit** (decided 2026-07-23 — a line
   with `quantity: 3` explodes 3 reports). Invariants kept: the creation flow captures
   **technician + reportType per line** up front, so skeletons are born complete —
   folio, client from the order, `serviceId`, `serviceOrderId`, `assignedTo`,
   `reportType`, `status: 'pending'`; the units inherit the line's tech/type and are
   each individually reassignable after. Template choice stays a fill-time concern,
   prefiltered by `serviceId` (06).
3. Append the `service_order_events` `order_created` event (+ an `order_line_added`
   per line) — the order timeline opens with the creation (§7).
4. Append the `customer_interactions` system entry (`type: 'system'`, ref
   `service_order`/order id, actor): "Orden de servicio OS-… creada — N servicios" —
   the *customer* CRM timeline (08), complementary to the order timeline.
5. FK violations map to 422 `invalid_reference`; everything restrict; no cascades.

Lifecycle notes:
- `pending → in-progress` when the tech opens the report and picks a template
  (skipping `created`); the rest of the report lifecycle is unchanged (06).
- Order `status` is manual v1 (complete / cancel with confirm); auto-complete when
  all reports finish is an open decision. `order_completed` is what triggers the
  client handoff document (§7).
- Cancelling an order (decided 2026-07-23): its `scheduled` visits are **closed**
  (12's close path, category `other`/reason "orden cancelada") and its **unfinished
  reports** (`pending`/`in-progress`) are set to `cancelled`; already-`finished`/
  `mailed` reports stay (they're history). This is a lifecycle transition, not a
  hard delete — soft-delete rules untouched. Every child transition appends its own
  event to the order timeline.

## 3. Roles (extends `14-access-control.md` §2 — matrix ask in 18)

| Action | owner | admin | office | technician |
|---|---|---|---|---|
| List/read orders | ✓ | ✓ | ✓ | ✓ᵃ |
| Create orders (explosion included) | ✓ | ✓ | ✓ | — |
| Edit **comments** · change status | ✓ | ✓ | ✓ | — |
| Edit **location** | ✓ | ✓ | — | — |
| Edit **priority** / **promise date** (CP-2b) | ✓ | ✓ | ✓ | — |
| Reopen a `completed` order (CP-2b) | ✓ | ✓ | — | — |
| Generate a contract from an order (13) | ✓ | ✓ | — | — |
| See line prices | ✓ | ✓ | ✓ | hidden (decided 2026-07-23) |

a. Technicians reach orders through their assigned visits/reports (context header),
   not a browsing need — nav entry is staff-only. Technician-facing responses omit
   money (line/unit prices) entirely (decided 2026-07-23).

## 4. Expected API surface

- `GET /service-orders?customerId&status&q&priority&overdue&page&limit` → paged
  `{ items, total }`; items carry `reportsTotal`/`reportsFinished` (CP-2b — not
  money, so technicians get them too). `overdue=true` = `open` with
  `promisedDate` before today
- `GET /service-orders/:id` → order + lines (snapshot columns) only (decided
  2026-07-27 — reports lazy-load, visits join in CP-3)
- `GET /service-orders/:id/reports` → the exploded reports
  (folio/status/assignee), **lazy-loaded** by the order view's reports card
  (decided 2026-07-27); unpaged — the explosion cap bounds it at 50
- `GET /service-orders/:id/timeline` → resolved `service_order_events` (§7),
  **paged newest-first** (decided 2026-07-27 — the interactions feed idiom;
  supersedes "oldest-first unpaged"). The handoff document composes from its own
  full oldest-first internal read, so paging the HTTP feed costs the audit
  nothing
- `POST /service-orders` — `{ customerId, location?, comments?, lines: [{ serviceId,
  quantity, technicianId, reportType }] }` → the §2 transaction. Caps (decided
  2026-07-27, sized to real usage of ≤~10 services/order): ≤20 lines, quantity
  ≤20, ≤50 exploded reports total; duplicate `serviceId` lines are a 400
- `PATCH /service-orders/:id` — `comments`/`priority`/`promisedDate` (any staff,
  CP-2b) and/or `location` (**owner/admin only** — 403 for office); each audited
  to the timeline. No other field is patchable.
- `POST /service-orders/:id/status` — `{ status }` (complete/cancel, confirm-heavy);
  `completed` yields the client handoff document (§7). From CP-2b it also accepts
  `open`: the **owner/admin-only reopen** of a `completed` order (`cancelled` is
  terminal), emitting the reserved `order_status_changed` event
- Contract generation is **`POST /contracts` (13)** carrying this order's id (0..n per
  order); the order view's **Generar contrato** launches it and it logs
  `order_contract_generated` (refId → the contract) on this order's timeline. No
  `contractId` on the order — the link lives on the contract (13 §1).
- `GET /customers/:id/service-orders` — customer-view card (07 slot — ask)
- Lines are immutable after creation in v1 (open decision) — no line endpoints.

## 5. Pages & components

- `service-orders/pages/orders-list/` — p-table (folio `font-data`, cliente, servicios
  count, status pill, total `font-data`, fecha), URL filters (`q`/`customer`/`status`).
- `service-orders/pages/order-view/` — header (folio, client link, status actions),
  lines card, exploded-reports card (status pills, link out), visits card with
  **Programar visita** (opens 12's dialog with the order locked), and a **contratos** card
  with **Generar contrato** (13, 0..n).
- `service-orders/pages/order-builder/` — **dedicated create page** (decided
  2026-07-23, not a dialog — too heavy for the shape-3 idiom): client select + location
  + comments, then the lines builder (service select + quantity + technician +
  reportType per row, add/remove rows, per-line + running total), and a review/confirm
  before the create transaction (which explodes the reports). Route
  `/service-orders/new`; "Nueva orden" on the list navigates here, not a dialog.
- Customer view (07): "Órdenes de servicio" card.
- Nav: **Negocio → Órdenes** (`module: 'service-orders'`, staff only).

## 6. State

- `ServiceOrdersState`: `items`, `total`, `loading`, `selected`, `query`. Actions:
  `LoadOrders`, `LoadOrderDetail`, `CreateOrder`, `UpdateOrder`, `SetOrderStatus`.
- `src/app/services/http/service-orders.service.ts`.

## 7. Order activity timeline — the audit trail + client handoff (decided 2026-07-23)

**The service order is the single audit aggregate.** One append-only table logs every
event across the order and its children; no per-child audit tables (supersedes 12's
visit-level `visit_events` / PR #97). Mirrors `customer_interactions`' append-only
posture (no updates, no deletes — the trail *is* the record).

```
ServiceOrderEvent {            // table: service_order_events (append-only)
  id,                          // uuid
  serviceOrderId,              // FK → service_orders, restrict
  type,                        // enum, category below
  actorId,                     // FK → users (who); null only for pure-system events
  refKind?, refId?,            // link-out to the child the event concerns:
                               //   'visit' | 'report' | 'line' | 'email' (+ its id)
  changes?,                    // jsonb diff (field → { from, to }) for edits/reassigns
  note?,                       // free text / the close reason note
  createdAt                    // no updatedAt, no deletedAt — append-only
}
```

**Event types (v1):**
- Order: `order_created`, `order_line_added`, `order_comment_updated`,
  `order_location_changed` (changes `location {from,to}`), `order_status_changed`,
  `order_completed`, `order_cancelled`, `order_contract_generated` (refId → contract),
  `order_mailed` (refId → the `service_order_emails` row; handoff sent to a client contact).
- Visit (from 12, logged here not on the visit): `visit_created`,
  `visit_reassigned` (changes `technicianId {from,to}`), `visit_corrected`,
  `visit_completed`, `visit_closed` (note = category + reason), `visit_rescheduled`
  (refId → the successor visit).
- Report (from 06): `report_exploded`, `report_status_changed`, `report_finished`.

**Writes:** every mutating endpoint in 12/06/19 appends its event **inside the same
transaction** as the state change (so the trail can never drift from reality). The
`customer_interactions` system entry on order creation (§2) stays — that's the
*customer* timeline (08); this is the *order* timeline. They're complementary: the CRM
one is "something happened with this client", the order one is the job's full history.

**Reads / handoff:**
- `GET /service-orders/:id/timeline` → resolved events (actor + child display names),
  paged newest-first (2026-07-27) — rendered on the order view as a vertical
  activity feed. The CP-5 handoff reads the full history internally, oldest-first.
- **Client handoff (the payoff):** at `order_completed`, the timeline + the finished
  reports compose a **service history PDF** (decided 2026-07-23 — via the `pdf/`
  module, consistent with report PDFs; the report layout stays in a domain helper per
  the pdf-toolkit split). This is *why* the audit lives at the order level: one
  artifact covers the whole job end-to-end.
- **Delivery — download or email, mirroring the report mailer (decided 2026-07-25):**
  a completed order's handoff PDF can be **downloaded by staff** or **emailed to the
  client's selected contacts**, following the report-email backend pattern
  (`reports/services/report-email.service.ts`) as-is:
  - **`service_order_emails`** send-log table mirrors `report_emails` — `serviceOrderId`
    FK, `sentBy` (users, restrict), `sentAt`, `recipientTo`, `recipientCc[]`, unique
    `accessToken`, `expiresAt?`, `revokedAt?`, `resendMessageId?`. It is the audit that
    the handoff was sent (no open-tracking).
  - `POST /service-orders/:id/email` (owner/admin), body mirroring `sendReportEmailSchema`
    (`to?`/`cc?` emails + `expiresInDays?` 1–365 + `message?`). **Recipients are chosen
    from the client's contacts** (07 `customer_contacts`) via the **shared contact picker
    (name + area)** — the same picker report mailing uses (06); contacts without an email
    are non-selectable.
  - The email carries a **secure tokenized download link, not an attachment** (the report
    pattern is explicit — "no attachments"): a JWT-whitelisted
    `GET /service-orders/download/:token` renders the handoff PDF on demand and streams
    it (like `/reports/download/:token`), honouring `expiresAt`/`revokedAt`.
  - `dispatchServiceOrderEmail` mirrors `dispatchReportEmail`: compose the PDF,
    brand-derived `from`/`replyTo` (rule 5), send via the generic `email/` transport,
    stamp `resendMessageId`, and append an **`order_mailed`** event to the timeline — the
    send is itself audited. Staff **download** hits an authenticated
    `GET /service-orders/:id/document` (the same PDF). History + revoke:
    `GET /service-orders/:id/emails` + `POST /service-orders/emails/:emailId/revoke`.

---

## Checkpoints (implementation order — the operations suite, decided 2026-07-23)

### CP-1 — Backend: orders + explosion + timeline
*Branch `feature/backend-service-orders`. Standalone against `main` — no quotations, no
visits (2026-07-26 scope decision above).*

- [x] 18 CP-1 lands first (services table + CRUD) — **done**, #102
- [ ] `service_orders` + `service_order_services` + `service_order_counters` +
      **`service_order_events`** tables, hand-written additive DDL (no `quotationId`);
      `reports.serviceOrderId/serviceId`; `pending`/`cancelled` status widen
- [ ] `POST /service-orders` transaction (folio, lines, explosion, `order_created`/
      `order_line_added` events, customer interaction)
- [ ] List/detail/patch/status endpoints + `GET /:id/timeline` + role guards
- [ ] `service_order_events` type enum ships complete, visit_* members included but
      unwired (their writer arrives with 12's rebuild in CP-3)
- [x] ~~**Visit-audit relocation:** rip the visit-level `visit_events` (PR #97)~~ —
      **obsolete 2026-07-26:** #97 closed unmerged, so nothing to rip; CP-3 builds
      visits order-bound and writing to `service_order_events` from the start

### CP-2 — Superadmin: orders UI
- [x] DTOs + `ServiceOrdersState` + http service
- [x] Orders list (URL filters) + **order-builder page** (lines builder, `/new`) +
      order view with the **activity timeline feed** (§7)
- [x] Nav + module keys; customer-view card (07 ask) — built 2026-07-28 on
      `feature/superadmin-service-orders-ui`, PR pending

### CP-2b — Dispatch polish (decided 2026-07-29): priority · promise dates · progress · reopen · duplicate
*Branch `feature/fullstack-service-orders-dispatch`, stacked on CP-2's UI branch; one
fullstack PR. The customer-facing tracking link raised the same day is **deferred**
until after CP-5 (it will reuse the handoff token machinery).*

**Schema (DDL 0028, additive + idempotence-guarded, applied straight to the shared DB):**
- `service_orders.priority` text NOT NULL default `'normal'` — TS enum
  `ServiceOrderPriority { Normal = 'normal', Urgent = 'urgent' }`. Two levels only:
  dispatch needs "jump the queue", not a severity ladder.
- `service_orders.promised_date` **date**, nullable — the "fecha compromiso" told to
  the client. Date-only on purpose: promises are day-granular, and a timestamptz
  would drag timezone math into every compare. Overdue = `open` AND
  `promised_date < CURRENT_DATE` (the UTC day flip fires a few hours early on
  Monterrey evenings — acceptable v1, revisit only if it annoys).

**Progress counts.** List items + detail gain `reportsTotal` / `reportsFinished`
(finished = `finished` | `mailed`; **cancelled reports excluded from both** — the
denominator is real work, not voided rows). One grouped-count query per list page,
same round-trip shape as `listLinesForOrders`. Not money, so technicians see it.
UI: an "Avance" column (`3/5`) + a header chip on the order view; the Completar
confirm warns when unfinished reports remain ("quedan N reportes sin terminar") —
which also feeds the still-open auto-complete decision with real data.

**Reopen — `completed → open`, owner/admin only.** `POST /:id/status` accepts
`open`: a guarded UPDATE (`where status = 'completed'`) emitting the **reserved
`order_status_changed`** event (`{ completed → open }` + optional motivo) — exactly
what that member was reserved for. `cancelled` stays terminal: its cascade voided
children, and un-voiding cannot be done honestly (an `in-progress` report would
come back `pending`). Office gets a 403 on the `open` target — this is a safety
valve for a fat-fingered Completar, not a flow. CP-5 note: reopening after the
handoff was mailed leaves the trail showing exactly that; whether the mailed link
also gets revoked is CP-5's call.

**Duplicar orden — frontend only.** Order view (staff): "Duplicar" →
`/service-orders/new?from=<id>`; the builder fetches the source order (plain http
read, not the store) and prefills client + location + comments + lines
(service + quantity). `technicianId`/`reportType` are **deliberately not copied** —
they are explosion inputs owned by the exploded reports (19 §1), and the source
order's assignments are stale by design; prices resolve fresh from today's catalog
(what the builder already does). Lines whose service has left the catalog are
skipped with a toast naming how many. Directly serves 13's "future programmed
maintenance = new orders".

- [ ] DDL 0028 + model/enum/validator legs: `priority` + `promisedDate` on create,
      PATCH (any-staff role split kept: `location` stays owner/admin) and the list
      filters `priority` / `overdue=true`; new event members
      `order_priority_changed` / `order_promise_changed` (TS-only — no DB CHECK)
- [ ] Progress counts in the list + detail repository reads + DTOs
- [ ] Reopen leg of the status endpoint (validator widens to `open`, service gates
      the role, repository emits `order_status_changed`)
- [ ] Superadmin: builder fields (priority select + fecha compromiso), list
      ("Urgente"/"Vencida" tags, Avance column, popover filters in the URL),
      edit-dialog fields, Reabrir (completed, owner/admin, confirm + motivo) and
      Duplicar actions, Completar-confirm warning
- [ ] Tests: create defaults + roundtrip, PATCH events + closed-order 409
      unchanged, `priority`/`overdue` filters, counts (explode → finish one →
      `1/3`), reopen matrix (admin ok + PATCH works again / office 403 /
      cancelled 409 / double-reopen 409)

### CP-3 — Calendar (closes 12 CP-1/CP-2 UI, immutable-record model)
*Not a "rewire" any more (2026-07-26): PR #97 was closed unmerged, so CP-3 **builds** the
visits backend — `scheduled_visits` with `serviceOrderId` NOT NULL from birth, no
`visit_events` table ever, visit mutations appending straight to `service_order_events`.*

- [ ] Visit dialog gains the required **order** select (client-scoped); order-view
      "Programar visita" pre-locks it
- [ ] Respond / close (categorized reason) / reschedule (new record) flows; open-visit
      correction + reassign; every action lands on the order timeline
- [ ] Week grid ships (12 §3) with order folio on the chip hover/dialog

### CP-4 — Templates prefilter (06 rewire)
- [ ] `report_templates.serviceId` + builder field ("Servicio asociado")
- [ ] Fill-time picker: exact-service templates first, generic fallback (open
      decision below)
- [ ] Field app surfaces `pending` in the tech's list once assigned

### CP-5 — Handoff document + delivery + billing hooks
- [ ] Client **service history PDF** at `order_completed` (timeline + finished reports
      → PDF via the `pdf/` module + a domain layout helper, per the pdf-toolkit split)
- [ ] **Delivery, mirroring the report mailer:** `service_order_emails` send-log;
      `POST /:id/email` (owner/admin, recipients from the client's contacts via the
      shared name+area picker) → tokenized `GET /service-orders/download/:token` link
      (JWT-whitelisted, on-demand render) — **a link, not an attachment**; authenticated
      `GET /:id/document` staff download; `GET /:id/emails` history +
      `POST /service-orders/emails/:emailId/revoke`; `order_mailed` timeline event on send
- [ ] Order auto-complete rule (if adopted); price visibility per role
- [ ] 09 asks: bill from line snapshots

## Open decisions / asks
- **Decided 2026-07-29 — CP-2b dispatch polish** (full spec in the CP-2b checkpoint):
  two-level `priority`; date-only `promisedDate` + `overdue=true` filter; list/detail
  progress counts with cancelled reports excluded from the denominator; reopen
  `completed → open` (owner/admin, via the reserved `order_status_changed`;
  `cancelled` stays terminal); frontend-only Duplicar prefill that deliberately
  drops technician/reportType. The **customer-facing tracking link** raised the
  same day is deferred until after CP-5.
- **Decided 2026-07-26 — CP-1 build scope (see the scope blockquote up top):** CP-1 is
  backend-only and standalone. **No `quotationId`** (20 adds it with the accept flow),
  **no `scheduled_visits` touch** (#97 closed unmerged → CP-3 builds visits order-bound;
  the visit-audit relocation is obsolete, not deferred), **visit\_\* event types shipped
  in the enum now** but unwired. Orders and quotations stay decoupled until both modules
  are finished.
- **Decided 2026-07-23:** uuid PK + display folio; visits strictly order-bound
  (NOT NULL); explosion keeps report invariants — technician + reportType captured
  per line at creation; sequenced ahead of the calendar UI.
  **Audit is order-level:** one append-only `service_order_events` timeline is the
  sole audit trail (no per-child audit tables; supersedes visit-level `visit_events`),
  and it's the client handoff document at service end.
- ~~Handoff delivery~~ — **decided 2026-07-25: download or email to the client's
  selected contacts, mirroring the report mailer** — a `service_order_emails` send-log +
  a tokenized `GET /service-orders/download/:token` link (a **link, not an attachment**,
  per the report pattern), an authenticated staff `GET /:id/document` download, and an
  `order_mailed` timeline event. Recipients come from the client's `customer_contacts`
  (07) via the shared name+area contact picker.
- Timeline granularity: do report *content* edits log to the order timeline, or only
  status transitions? Leaning status-only (content lives in the report itself) to keep
  the handoff readable.
- ~~Explosion × quantity~~ — **decided 2026-07-23: one report per unit** (a
  `quantity: 3` line explodes 3 `pending` reports; each individually reassignable).
- ~~Cancelled order → pending reports~~ — **decided 2026-07-23:** add `cancelled` to
  `ReportStatus`; on order cancel, unfinished reports (`pending`/`in-progress`) → 
  `cancelled`, finished/mailed untouched (06 §amendment). Never a hard delete.
- ~~Handoff format~~ — **decided 2026-07-23: PDF** via the `pdf/` module (delivery
  channel decided 2026-07-25 — see the handoff-delivery entry above).
- Template picker fallback: exact-service + generic (`serviceId is null`) under a
  divider (recommended) vs exact-only.
- Line mutability: immutable v1 (recommended) vs add/remove lines on open orders
  (would need explosion deltas + audit).
- ~~Technician price visibility~~ — **decided 2026-07-23: hidden.** Technician-facing
  responses omit line/unit prices entirely.
- ~~Order creation UX: dialog vs dedicated page~~ — **decided 2026-07-23: dedicated
  builder page** (`/service-orders/new`); the multi-line builder is too heavy for the
  shape-3 dialog idiom.
- **Order → contract direction — settled 2026-07-24:** an order generates **0..n
  contracts** (13), each a **stored signed document** (guarantee/maintenance/rent/sell…),
  linked via `contracts.serviceOrderId`; a contract never generates an order or visits.
  The earlier "recurring póliza produces future work" question is **resolved — it doesn't
  auto-generate**: a `programmed_maintenance` contract is a document, and future
  maintenance is booked as new orders (optionally citing the contract). Standalone
  contracts (no order) allowed. See `13-contracts.md`.
- Ask to 07: "Órdenes de servicio" card slot on customer view.
- Ask to 14: `service-orders` module row in the matrix.
