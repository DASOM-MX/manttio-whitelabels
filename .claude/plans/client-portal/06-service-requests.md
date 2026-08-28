# client-portal / 06 — Service requests

> **Status:** planned (doc) · **Depends on:** 01, 03 · **Feeds:** superadmin 27
> **Owner:** — · **Last updated:** 2026-08-28

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

- **Equipment** is picked from `GET /portal/equipment` (the customer's registry, module 11,
  scoped by token). Required when the registry is non-empty; when it is empty the form says so
  and files without one (`equipment_id` nullable by design — 01 §4, ask A9).
- **Description** is the required free text. A minimum length is enforced server-side; "no
  enfría" with nothing else costs staff a round-trip, so the form asks for symptom, when it
  started, and whether it is intermittent — as *placeholder guidance*, not as extra required
  fields.
- **Evidence** is up to 3 images, uploaded one at a time to `POST /portal/upload/evidence`,
  URLs stashed client-side and committed with the request (the field app's report-picture
  pattern). Bucket per ask **A5**.
- `customerId` and `contactId` come from the token. Never from the body.
- The insert and its `created` event are one transaction; `folio` comes from the
  `service_request_counters` upsert.

## 3. The lifecycle

```
submitted ──► in_review ──► approved  (quotation_id set, terminal)
    │             │
    │             ├──► needs_info ──► (client answers) ──► in_review
    │             │
    └──► rejected ◄┘   (reason required, terminal)
```

Transitions are enforced in the service, not only in the UI. Each writes a
`service_request_events` row in the same transaction, attributed to `actorId` (staff) or
`contactId` (portal) — never both.

**The client's side of it:** a request in `needs_info` shows the staff question and a single
answer box (`POST /portal/service-requests/:id/answer`), which appends `info_provided` and
returns the request to `in_review`. The customer cannot edit a filed request otherwise — the
description they submitted is what staff are working from, and silently mutating it under
review is how disputes start. Adding evidence later is allowed (`evidence_added`).

## 4. Approval → draft quotation

Staff approve from superadmin 27. In one transaction:

1. Create a quotation for the customer in `draft` — folio from `quotation_counters`, no lines,
   `validUntil` at the tenant default.
2. Seed its terms/context from the request: folio, equipment, and the customer's description,
   so whoever prices it is reading the customer's own words.
3. Set `service_requests.quotation_id`, flip the status to `approved`.
4. Append `approved` + `quotation_linked` events.
5. Notify (§5) and hand staff straight to the quotation editor.

The quotation then lives its normal life (20): staff add catalog lines, price it, send it to
reviewer contacts. **Nothing about that flow changes** — a request-born quote is an ordinary
quote with a backlink.

**Ask A6** stands: if that quotation is later *declined* by the client, does the request reopen
or stay `approved` with a dead-ended quote? Proposal: stays `approved` — the request was
honored; the negotiation is the quotation's story, not the request's.

## 5. Notifications (00 §3.15)

Staff, in-app, through the existing notifications module — new `NotificationType` members plus
the additive CHECK extension (01 §7):

```
ServiceRequestSubmitted = 'service_request_submitted'
ServiceRequestAnswered  = 'service_request_answered'   // client replied to needs_info
```

Recipient policy: owner/admin/office role broadcast (the module fans a role send out to one row
per active user). `data` carries `{ requestId, folio, customerId, link }`.

Contact, by email, through the `email` module with brand config (no literals):
request received, information requested, approved (with the quote to expect), rejected (with
the reason). Every one of these is a transactional email to a person who asked for it.

## 6. Where else a request shows up

- **Equipment history (11):** a unit's timeline gains its requests alongside its reports —
  the customer-reported symptoms are exactly the context a technician wants.
- **CRM timeline (08):** *not* written by default. Requests have their own append-only trail;
  duplicating them into `customer_interactions` would double-write an audit that is already
  complete. Revisit only if staff ask for it.

## 7. Checkpoints

- [ ] **CP-1** — backend module: tables wired (01 CP-2), create + list + detail + answer
      endpoints, transition guard, counters, events, grant + scope tests.
- [ ] **CP-2** — `POST /portal/upload/evidence` + bucket decision (A5).
- [ ] **CP-3** — portal UI: request list, detail with timeline, new-request form with equipment
      picker + evidence uploader, `needs_info` answer box.
- [ ] **CP-4** — approval → draft quotation transaction + backlink, with the staff-side trigger
      landing in superadmin 27.
- [ ] **CP-5** — notification types + CHECK extension + the four contact emails.
