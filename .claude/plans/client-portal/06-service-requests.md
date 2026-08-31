# client-portal / 06 — Service requests

> **Status:** planned (doc) · **Depends on:** 01, 03 · **Feeds:** superadmin 27
> **Owner:** — · **Last updated:** 2026-08-30

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
  Equipos section (A8, 04 §7), scoped by token. **The selection is never required (A9, owner
  2026-08-30):** the unit may simply not have been registered yet, and a customer who cannot
  name it in our registry still has a broken chiller. The picker always carries an explicit
  "no aparece mi equipo" option, and choosing it files with `equipment_id` null.
- **Description** is the required free text. A minimum length is enforced server-side; "no
  enfría" with nothing else costs staff a round-trip, so the form asks for symptom, when it
  started, and whether it is intermittent — as *placeholder guidance*, not as extra required
  fields.
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

any non-terminal state ──► closed   (portal admin only, TERMINAL)
```

Transitions are enforced in the service, not only in the UI. Each writes a
`service_request_events` row in the same transaction, attributed to `actorId` (staff) or
`contactId` (portal) — never both.

**`approved` is not terminal.** It means staff accepted the request and are quoting it. A
request may carry **several quotations over its life** — the link lives on
`quotations.service_request_id` (01 §6b) precisely so it can.

**Only the customer closes a request (A6).** The terminal client-side state is `closed`, and
`POST /portal/service-requests/:id/close` is gated on **`portal_users.is_admin`**, not on a
grant (01 §1, 02 §3). Staff have no close action: they can reject a request they will not take,
but once they have taken it, the customer decides when the matter is finished. A close writes a
`closed` event with the acting contact, sets `closed_at` / `closed_by_portal_user_id`, and
raises a staff notification (§5).

**The client's side of it:** a request in `needs_info` shows the staff question and a single
answer box (`POST /portal/service-requests/:id/answer`), which appends `info_provided` and
returns the request to `in_review`. The customer cannot edit a filed request otherwise — the
description they submitted is what staff are working from, and silently mutating it under
review is how disputes start. Adding evidence later is allowed (`evidence_added`).

**A non-admin portal user cannot close**, including the one who filed it. That is the answer as
given; if a filer should be able to withdraw their own untouched request, that is a second
power to decide, not one to assume.

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
      picker + "no aparece mi equipo" + evidence uploader, `needs_info` answer box.
- [ ] **CP-4** — approval → draft quotation transaction writing `quotations.service_request_id`
      (01 CP-3), with the staff-side trigger landing in superadmin 27.
- [ ] **CP-5** — `POST /portal/service-requests/:id/close` gated on `isAdmin`, the `closed`
      event + columns, and the portal's close affordance (visible only to an admin).
- [ ] **CP-6** — notification types + CHECK extension + the four contact emails.

## 8. Asks

Resolved 2026-08-30: **A5**, **A6**, **A8**, **A9** — see 00 §4. Still open: **A17** (must staff
attach an equipment record before approving a request filed without one?) — 00 §5.
