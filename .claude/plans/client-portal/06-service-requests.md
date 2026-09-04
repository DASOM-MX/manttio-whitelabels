# client-portal / 06 — Service requests

> **Status:** planned (doc) · **Depends on:** 01, 03 · **Feeds:** superadmin 27
> **Owner:** — · **Last updated:** 2026-08-31

The one thing a customer *creates*. A service request is a described problem, not a priced
proposal: **equipment + behavior description + optional evidence image** (00 §3.13). Staff
review it and, on approval, it becomes a **linked draft quotation** (00 §3.14).

Backend module: `backend/src/modules/service-requests/`. Staff triage UI:
`../superadmin/27-service-requests.md`.

---

## 1. Why it is not a quotation draft

The customer is not qualified to price the work, and exposing the catalog to them turns a
support channel into a shopping cart with no margin control. They know one thing staff do not:
**what the unit is doing**. That is the whole payload, and everything commercial stays on the
staff side of the conversion.

## 2. Creating one (portal)

`POST /portal/service-requests` — grant `create_service_requests`.

```
{ equipmentId?: uuid, description: string, evidence?: string[] }
```

- **Equipment** is picked from `GET /portal/equipment` — the same endpoint that backs the
  Equipos section (A8, 04 §7), scoped by token. `create_service_requests` reaches it for the
  picker even without `view_equipment` (02 §3). **The selection is never required (A9, owner
  2026-08-30):** the unit may simply not have been registered yet, and a customer who cannot
  name it in our registry still has a broken chiller. The picker always carries an explicit
  "no aparece mi equipo" option, and choosing it files with `equipment_id` null.
- **Description** is the required free text, **bounded 10..300 characters server-side**
  (owner, 2026-09-02). "no enfría" with nothing else costs staff a round-trip, so the form
  asks for symptom, when it started, and whether it is intermittent — as *placeholder
  guidance*, not as extra required fields. The 300 ceiling keeps the triage queue readable;
  a customer with more to say adds it as an `info_provided` answer once staff ask.
  **The form shows a live character count** (CP-3) — the bounds are the customer's to see,
  not something they discover by being rejected.
- **Evidence** is up to 3 images, uploaded one at a time to `POST /portal/upload/evidence`,
  URLs stashed client-side and committed with the request (the field app's report-picture
  pattern). Bucket **`manttio-customer-report`** (A5, owner 2026-08-30) — a new R2 bucket with
  its own lifecycle, never `manttio-equipment`. Customer-uploaded bytes and tenant-owned asset
  bytes have different retention and different blast radii, so they do not share a bucket.
- `customerId` and `contactId` come from the token. Never from the body.
- The insert and its `created` event are one transaction; `folio` comes from the
  `service_request_counters` upsert.

## 3. The lifecycle (amended by A6, 2026-08-30)

```
submitted ──► in_review ──► approved ──► (quotation v1, v2, v3 … as needed)
    │             │            │
    │             ├──► needs_info ──► (client answers) ──► in_review
    │             │
    └──► rejected ◄┘   (staff, reason required, TERMINAL)

any non-terminal state ──► closed     (portal admin only, TERMINAL)
any non-terminal state ──► cancelled  (grant `cancel_service_requests`, TERMINAL,
                                       soft-deletes the row AND every quotation
                                       issued against it)
```

Transitions are enforced in the service, not only in the UI. Each writes a
`service_request_events` row in the same transaction, attributed to `actorId` (staff) or
`portalUserId` (portal) — never both. (Was `contactId`; changed 2026-09-01, 01 §5.)

**`approved` is not terminal.** It means staff accepted the request and are quoting it. A
request may carry **several quotations over its life** — the link lives on
`quotations.service_request_id` (01 §6b) precisely so it can.

**Only the customer closes a request (A6).** The terminal client-side state is `closed`, and
`POST /portal/service-requests/:id/close` is gated on **`portal_users.is_admin`**, not on a
grant (01 §1, 02 §3). Staff have no close action: they can reject a request they will not take,
but once they have taken it, the customer decides when the matter is finished. A close writes a
`closed` event with the acting contact, sets `closed_at` / `closed_by_portal_user_id`, and
raises a staff notification (§5).

### Cancelling (owner, 2026-09-03)

`closed` is no longer the only terminal client-side state. **`cancelled`** is the customer
withdrawing a request they no longer want, and it is a different act from closing: `closed`
means *"this is finished"*, `cancelled` means *"never mind"*.

- **`DELETE /portal/service-requests/:id`**, gated on the new **`cancel_service_requests`**
  grant (01 §3) — **not** on `is_admin`. Withdrawing work already in staff's hands is a
  different power from filing it, so the customer's own admin decides who holds it.
- **The verb is `DELETE`, not `POST /:id/cancel`** (owner, 2026-09-03). The codebase already
  splits these: `DELETE /:id` with the reason in the body is an audited soft delete (quotations,
  users, customers, reports, cms), while `POST /:id/<verb>` is a lifecycle move that leaves the
  row in place — the quotations controller says so in as many words. This one removes, so it
  takes the DELETE. The *domain* word stays "cancel": the status is `cancelled`, the event is
  `service_request_cancelled`, and the plan calls it cancelling.
- **A reason is required**, bounded 10..300 characters — the same bounds the owner set for
  `description` (2026-09-02), since both are customer free text on the same record. It lands in
  the event `note`, where `rejected` already keeps staff's reason.
- **It soft-deletes the row.** `deleted_at` + `deleted_by_portal_user_id` are stamped in the
  same transaction as the status change and the event. The cancel is `deleted_at`'s only
  writer, so a soft-deleted request is always a cancelled one.
- **Allowed from every live state, `approved` included.** An earlier draft of this section
  (same day) blocked `approved` on the grounds that it would strand a live quotation. The
  cascade below is what removes that objection — **superseded 2026-09-03**.
- **A request that already produced a service order cannot be cancelled at all (owner,
  2026-09-03).** If any live quotation on the request carries a **live** `service_order_id`, the
  route refuses with **409 `request_has_service_order`** and a message naming the order folios,
  telling the customer to cancel the order first. The work is already scheduled; the cascade
  would otherwise soft-delete the order's own origin document underneath it, leaving a live
  order that has lost its `quotationFolio`. **Cancelling an order is staff's**, not the portal's
  — there is no portal route for it, by design.
  - A **soft-deleted** order does not block. It is history, and letting one wedge the customer
    out of withdrawing would be a dead end.
  - The check runs before the cancel transaction, the same shape `answerRequest` already uses
    for its status precondition.
- **The quotations cascade with it (owner, 2026-09-03).** Every quotation hanging off the
  request (`quotations.service_request_id`, 01 §6b) is **soft-deleted in the same transaction**,
  carrying `delete_comment = "cancelled by client: <reason>"` so a staff member reading the
  quotation on its own can see why it went. Application-level, never `ON DELETE CASCADE` — the
  fork forbids those, and the rows and their timelines stay.
  - Each cascaded quotation gets a `quotation_deleted` event attributed to the acting
    **`contactId`**, the portal side of `quotation_events` (01 §6c). `deleted_by` stays null:
    that column references `users.id` and a portal cancel has no staff actor.
  - Because a deleted quotation drops out of every read, its **mailed recipient links stop
    resolving** — the same consequence the staff delete already has.
- **Idempotent.** The write matches on `deleted_at is null`, so a second cancel is a 404 rather
  than a restamped row and a duplicate event.

**Visibility (owner, 2026-09-03).** A cancelled request is **absent from the default list** and
returns only under an explicit **`?status=cancelled`** filter — the one read in the module that
reaches soft-deleted rows. The detail route is deliberately unfiltered on `deleted_at` too, so a
request found through that filter can actually be opened.

> **Open, for the owner.** `requireGrant` answers a missing grant with **404** (02 §1). For the
> admin-gated close, 02 §3 argues the opposite — a record the user can already see should be
> refused with **403**, because hiding it leaks nothing either way. Cancel has the same shape: a
> user with `create_service_requests` but not `cancel_service_requests` can see the request and
> gets a 404 on the cancel route. Shipped as 404 for consistency with the middleware; say the
> word and it becomes a 403 like close.

**The client's side of it:** a request in `needs_info` shows the staff question and a single
answer box (`POST /portal/service-requests/:id/answer`), which appends `info_provided` and
returns the request to `in_review`. The customer cannot edit a filed request otherwise — the
description they submitted is what staff are working from, and silently mutating it under
review is how disputes start. Adding evidence later is allowed (`evidence_added`).

**A non-admin portal user cannot close**, including the one who filed it. That is the answer as
given; if a filer should be able to withdraw their own untouched request, that is a second
power to decide, not one to assume.

## 3b. Where a request sits in the chain (A6 confirmation, 2026-08-31)

```
service_request ──► quotation ⇄ approval / denial ──► service_order (0–1)
```

Everything from `quotation` rightward **already exists and does not change**: the reviewer tally
is the approval/denial loop (20 §2), and `quotations.service_order_id` already carries the
0-or-1 conversion (20 §6). The portal's contribution is the first arrow — a customer-authored
head for a chain that previously started with a staff member deciding to quote.

Read the cardinalities carefully, because they are not all the same:

- **request → quotation: 0..n.** A declined quote is followed by another against the same
  request (§4b).
- **quotation → service order: 0..1.** Unchanged; a quote converts once or never.
- **request → service order: indirect only.** There is no FK between them and none is added; the
  path is always through a quotation, so a request that never produced one produced no work.

## 4. Approval → draft quotation

Staff approve from superadmin 27. In one transaction:

1. Create a quotation for the customer in `draft` — folio from `quotation_counters`, no lines,
   `validUntil` at the tenant default.
2. Seed its terms/context from the request: folio, equipment, and the customer's description,
   so whoever prices it is reading the customer's own words.
3. Set **`quotations.service_request_id`** on the new quote (01 §6b) and flip the request's
   status to `approved`.
4. Append `approved` + `quotation_linked` events.
5. Notify (§5) and hand staff straight to the quotation editor.

The quotation then lives its normal life (20): staff add catalog lines, price it, send it to
reviewer contacts. **Nothing about that flow changes** — a request-born quote is an ordinary
quote with a backlink.

### 4b. When the client declines that quotation (A6, owner 2026-08-30)

**Nothing automatic happens to the request.** It does not reopen, and it does not close.

- The request stays `approved` — staff took it, and they still have it.
- **Staff issue a new quotation manually**, against the same request, with its own
  `service_request_id`. There is no revise-in-place and no auto-generated successor: the decision
  to quote again is a commercial one, and a system that made it automatically would be pricing
  work nobody agreed to do. (The quotation module's own revise chain,
  `supersedes_quotation_id`, is unaffected and can still be used when the new quote is a
  revision of the old rather than a fresh proposal.)
- **The customer's portal admin closes the request** when they are done with it — whether that
  is after an accepted quote, after giving up, or after solving it themselves.
- Each attached quotation appends its own `quotation_linked` event, so the request's timeline
  reads v1 → declined → v2 without any status churn.

**Consequence for the staff queue (superadmin 27):** `approved` requests are open-ended and
accumulate, since only the customer retires them. The triage queue must therefore split "needs
staff attention" (`submitted`, `in_review`, `needs_info`) from "quoted, awaiting the client"
(`approved`), and default to the former — otherwise the queue grows forever and stops being
read.

## 5. Notifications (00 §3.15)

Staff, in-app, through the existing notifications module — new `NotificationType` members plus
the additive CHECK extension (01 §7):

```
ServiceRequestSubmitted = 'service_request_submitted'
ServiceRequestAnswered  = 'service_request_answered'   // client replied to needs_info
ServiceRequestClosed    = 'service_request_closed'     // the customer's admin closed it (A6)
```

`ServiceRequestClosed` matters precisely because staff cannot cause it: a request leaving the
queue is otherwise invisible to the person who was working it.

Recipient policy: owner/admin/office role broadcast (the module fans a role send out to one row
per active user). `data` carries `{ requestId, folio, customerId, link }`.

Contact, by email, through the `email` module with brand config (no literals):
request received, information requested, approved (with the quote to expect), rejected (with
the reason). Every one of these is a transactional email to a person who asked for it. A
**close** sends no email — the customer performed it themselves.

## 6. Where else a request shows up

- **Equipment history (11):** a unit's timeline gains its requests alongside its reports —
  the customer-reported symptoms are exactly the context a technician wants.
- **CRM timeline (08):** *not* written by default. Requests have their own append-only trail;
  duplicating them into `customer_interactions` would double-write an audit that is already
  complete. Revisit only if staff ask for it.

## 7. Checkpoints

- [ ] **CP-1** — backend module: tables wired (01 CP-2), create + list + detail + answer
      endpoints, transition guard, counters, events, grant + scope tests.
- [ ] **CP-2** — `POST /portal/upload/evidence` + the `manttio-customer-report` bucket binding
      (A5), 3-image cap enforced server-side.
- [ ] **CP-3** — portal UI: request list, detail with timeline, new-request form with equipment
      picker + "no aparece mi equipo" + evidence uploader + the description's **live character
      count** against the 10..300 bounds (§2), `needs_info` answer box.
- [ ] **CP-4** — approval → draft quotation transaction writing `quotations.service_request_id`
      (01 CP-3), with the staff-side trigger landing in superadmin 27.
- [ ] **CP-5** — `POST /portal/service-requests/:id/close` gated on `isAdmin`, the `closed`
      event + columns, and the portal's close affordance (visible only to an admin).
- [ ] **CP-6** — notification types + CHECK extension + the four contact emails.

## 8. Asks

Resolved 2026-08-30: **A5**, **A6**, **A8**, **A9**. Resolved 2026-08-31: **A17** — staff may
create the equipment record **from the request view** and attach it (superadmin 27 §3), but
`equipment_id` stays nullable and no lifecycle step requires it. None open; see 00 §4–5.
