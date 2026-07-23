# 18 — Service orders

> **Status:** planned · **Depends on:** 07 (client), 17 (catalog), 06 (report explosion), 12 (visits) · **Hooks:** 08 (timeline), 09 (billing), 13 (contracts likely generate orders — ask)
> **Owner:** — · **Last updated:** 2026-07-23

The **commercial job**: what was sold to whom, and everything operational that hangs
off it. One order composes 1..n catalog services (17) for one client, **owns 1..n
scheduled visits** (12 — when we go) and **0..n reports** (06 — what happened).
Creating an order also announces itself on the client's CRM timeline (08).

```
customers 1 ─── * service_orders 1 ─┬─ * service_order_services * ─── 1 services
                                    ├─ * scheduled_visits   (12 — NOT NULL, order-bound)
                                    └─ * reports            (06 — exploded + later links)
report_templates * ─── 1 services   (06 §5 — fill-time picker prefilter)
customer_interactions ← system entry on order creation (08)
```

## 1. Data model (DTO view)

```
ServiceOrder {
  id,                      // uuid PK (decided 2026-07-23 — folio is display-only)
  folio,                   // 'OS-YYYYMMDD-NNNN', unique — own daily counters
                           //   table (service_order_counters, report_counters
                           //   mechanics)
  customerId,              // required — restrict, never cascade
  status: 'open' | 'completed' | 'cancelled',
  title?, notes?,
  createdBy, createdAt, updatedAt   // deletedAt: soft delete only
}
ServiceOrderLine {         // table: service_order_services
  id, serviceOrderId, serviceId,
  quantity,                // int >= 1, default 1
  unitPrice,               // numeric(12,2) SNAPSHOT of services.price at order
                           //   time — catalog edits never rewrite history
  // per-line explosion inputs (decided 2026-07-23 — invariants kept):
  //   the create flow captures technicianId + reportType per line; they live
  //   on the exploded report, not on the line
  createdAt                // unique (serviceOrderId, serviceId)
}
```

**Extensions to existing tables (all additive):**

- `scheduled_visits.serviceOrderId` — **NOT NULL**, restrict (decided 2026-07-23:
  strict order-bound; the table is empty pre-release so no backfill). Ad-hoc
  "visits" that aren't jobs stay CRM `visit` interactions (08); a diagnostic visit
  is a small order.
- `reports.serviceOrderId?` (nullable — manual/legacy reports stay valid) +
  `reports.serviceId?` (which line the report fulfills; drives the template
  prefilter). Both restrict.
- `ReportStatus` gains **`pending`** (widen `reports_status_check`): the exploded
  not-yet-started state. `created` remains the manual-report birth status.
- `report_templates.serviceId?` (nullable = generic template) — 06 §5 amendment.
- `InteractionRefKind` gains `ServiceOrder = 'service_order'` (TS-only; the table
  has no ref-kind CHECK).

## 2. Order creation — one transaction

1. Insert `service_orders` (folio from counters) + lines (price snapshot).
2. **Explode reports: one `pending` report per line** (open decision: × quantity).
   Invariants kept (decided 2026-07-23): the creation flow captures **technician +
   reportType per line** up front, so skeletons are born complete — folio, client
   from the order, `serviceId`, `serviceOrderId`, `assignedTo`, `reportType`,
   `status: 'pending'`. Template choice stays a fill-time concern, prefiltered by
   `serviceId` (06).
3. Append the `customer_interactions` system entry (`type: 'system'`, ref
   `service_order`/order id, actor): "Orden de servicio OS-… creada — N servicios".
4. FK violations map to 422 `invalid_reference`; everything restrict; no cascades.

Lifecycle notes:
- `pending → in-progress` when the tech opens the report and picks a template
  (skipping `created`); the rest of the report lifecycle is unchanged (06).
- Order `status` is manual v1 (complete / cancel with confirm); auto-complete when
  all reports finish is an open decision.
- Cancelling an order does **not** cascade: its pending reports are cancelled…
  reports have no `cancelled` status — open decision below; visits are cancelled
  through their own audited status path (12).

## 3. Roles (extends `14-access-control.md` §2 — matrix ask in 17)

| Action | owner | admin | office | technician |
|---|---|---|---|---|
| List/read orders | ✓ | ✓ | ✓ | ✓ᵃ |
| Create orders (explosion included) | ✓ | ✓ | ✓ | — |
| Edit title/notes · change status | ✓ | ✓ | ✓ | — |
| See line prices | ✓ | ✓ | ✓ | open decision (leaning hide) |

a. Technicians reach orders through their assigned visits/reports (context header),
   not a browsing need — nav entry is staff-only.

## 4. Expected API surface

- `GET /service-orders?customerId&status&page&limit` → paged `{ items, total }`
- `GET /service-orders/:id` → order + lines (joined service name/uom) + exploded
  reports (folio/status/assignee) + visits (12 shape)
- `POST /service-orders` — `{ customerId, title?, notes?, lines: [{ serviceId,
  quantity, technicianId, reportType }] }` → the §2 transaction
- `PATCH /service-orders/:id` — title/notes only
- `POST /service-orders/:id/status` — `{ status }` (complete/cancel, confirm-heavy)
- `GET /customers/:id/service-orders` — customer-view card (07 slot — ask)
- Lines are immutable after creation in v1 (open decision) — no line endpoints.

## 5. Pages & components

- `service-orders/pages/orders-list/` — p-table (folio `font-data`, cliente, servicios
  count, status pill, total `font-data`, fecha), URL filters (`q`/`customer`/`status`).
- `service-orders/pages/order-view/` — header (folio, client link, status actions),
  lines card, exploded-reports card (status pills, link out), visits card with
  **Programar visita** (opens 12's dialog with the order locked).
- `service-orders/components/order-form-dialog/` — shape-3 create: client select →
  lines builder (service select + quantity + technician + reportType per line, add/
  remove rows, running total) — the heaviest dialog yet; consider a full page if it
  fights the dialog shape (open decision).
- Customer view (07): "Órdenes de servicio" card.
- Nav: **Negocio → Órdenes** (`module: 'service-orders'`, staff only).

## 6. State

- `ServiceOrdersState`: `items`, `total`, `loading`, `selected`, `query`. Actions:
  `LoadOrders`, `LoadOrderDetail`, `CreateOrder`, `UpdateOrder`, `SetOrderStatus`.
- `src/app/services/http/service-orders.service.ts`.

---

## Checkpoints (implementation order — stacked on the calendar branch, decided 2026-07-23)

### CP-1 — Backend: catalog + orders + explosion
- [ ] 17 CP-1 lands first (services table + CRUD)
- [ ] `service_orders` + `service_order_services` + `service_order_counters` tables,
      hand-written additive DDL; `scheduled_visits.serviceOrderId` NOT NULL;
      `reports.serviceOrderId/serviceId`; `pending` status widen
- [ ] `POST /service-orders` transaction (folio, lines, explosion, interaction)
- [ ] List/detail/patch/status endpoints + role guards

### CP-2 — Superadmin: orders UI
- [ ] DTOs + `ServiceOrdersState` + http service
- [ ] Orders list (URL filters) + create dialog (lines builder) + order view
- [ ] Nav + module keys; customer-view card (07 ask)

### CP-3 — Calendar rewire (closes 12 CP-1/CP-2 UI)
- [ ] Visit dialog gains the required **order** select (client-scoped); order-view
      "Programar visita" pre-locks it
- [ ] Week grid ships (12 §3) with order folio on the chip hover/dialog

### CP-4 — Templates prefilter (06 rewire)
- [ ] `report_templates.serviceId` + builder field ("Servicio asociado")
- [ ] Fill-time picker: exact-service templates first, generic fallback (open
      decision below)
- [ ] Field app surfaces `pending` in the tech's list once assigned

### CP-5 — Polish + billing hooks
- [ ] Order auto-complete rule (if adopted); price visibility per role
- [ ] 09 asks: bill from line snapshots

## Open decisions / asks
- **Decided 2026-07-23:** uuid PK + display folio; visits strictly order-bound
  (NOT NULL); explosion keeps report invariants — technician + reportType captured
  per line at creation; stacked on the calendar branch ahead of the calendar UI.
- Explosion × quantity: one report per **line** (recommended, satisfies "at least
  one per service") vs one per unit when `quantity > 1`.
- What happens to `pending` reports when an order is cancelled — reports have no
  `cancelled` status; add one, or soft-delete the skeletons (they carry no field
  data)? Leaning: add `cancelled` to `ReportStatus` with 18 as the only writer.
- Template picker fallback: exact-service + generic (`serviceId is null`) under a
  divider (recommended) vs exact-only.
- Line mutability: immutable v1 (recommended) vs add/remove lines on open orders
  (would need explosion deltas + audit).
- Technician price visibility (leaning hide — reports/visits never show money).
- Order creation UX: dialog with lines builder vs dedicated page — decide when CP-2
  starts.
- Ask to 13: contracts generate *orders* (which explode visits/reports) instead of
  bare visits — reconcile with 13 §1 when contracts resume.
- Ask to 07: "Órdenes de servicio" card slot on customer view.
- Ask to 14: `service-orders` module row in the matrix.
