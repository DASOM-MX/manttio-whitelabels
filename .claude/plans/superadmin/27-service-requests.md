# 27 — Service requests (staff triage)

> **Status:** planned (doc) · **Depends on:** 07 (clients), 11 (equipment), 20 (quotations),
> `../client-portal/01-data-model.md` + `../client-portal/06-service-requests.md`
> **Owner:** — · **Last updated:** 2026-08-28

The **staff** half of the Portal de clientes' one write path. Customers file service requests
from the portal (`../client-portal/06-service-requests.md`); this module is where staff read,
question, reject or approve them — and approval is where a request becomes a **draft
quotation**.

The data model, lifecycle and endpoints are owned by the client-portal suite. **This file owns
the superadmin UI only.** If you need a shape change, record it as an ask there; do not add
columns from here.

---

## 1. Why it lives in superadmin

A request arrives from outside the company and has to be triaged by whoever is on duty — the
same people who already live in the superadmin all day. Putting the queue anywhere else means
a second tab nobody watches, and a request nobody reads is worse than no portal at all.

## 2. Nav + the queue

New sidebar entry **Solicitudes**, badged with the count in `submitted`.

- `p-table`, server-paginated, filters **in the URL** (`queryParamMap` single load path):
  status, customer, equipment, date range, free text over folio + description.
- Default filter is **`submitted` + `needs_info`** — the two states where the queue is waiting
  on somebody. `in_review` is somebody's open work; terminal states are history.
- Columns: folio, customer, equipment, description excerpt, filed by (contact), age, status.
- **Age is the column that matters.** A request sitting three days in `submitted` is the
  failure mode this whole module exists to prevent — surface it, sort by it, and let the
  default sort be oldest-first, not newest-first.
- Row click → detail. No inline actions on the list; every action is a decision that wants the
  full context.

## 3. Detail

Read-only left column: customer (deep-link to 07), equipment (deep-link to 11 with its service
history), the customer's verbatim description, evidence images in a lightbox, filed-by contact
and portal user, folio, dates.

Right column: the **append-only timeline** (`service_request_events`), rendered like the
quotation timeline — staff actions and client actions visually distinguished, because "who
said this" is the point.

Actions, each gated by role (`../14-access-control.md` — owner/admin/office operational;
technician has no access to this module):

| Action | From | Effect |
|---|---|---|
| **Tomar** | `submitted` | → `in_review`, appends `taken_for_review` with the actor. Claims it so two people don't work the same request. |
| **Solicitar información** | `in_review` | Required question text → `needs_info`, appends `info_requested`, emails the contact. Ball returns to the client. |
| **Aprobar y cotizar** | `in_review` | The conversion (§4). |
| **Rechazar** | `submitted`, `in_review` | **Mandatory reason**, → `rejected`, appends `rejected`, emails the contact. Terminal. |

No edit affordance on the customer's description, ever — the request is evidence.

## 4. Aprobar y cotizar

One confirm dialog, one transaction (`../client-portal/06-service-requests.md` §4), and the
staff member lands **in the new quotation's editor** with the request's context already in the
terms block. The moment of approval is the moment somebody is ready to price the work; making
them navigate to Cotizaciones and start from an empty form is how the link gets lost.

The quotation detail page (20) gains a **"Origen: solicitud SOL-…"** backlink chip.

## 5. Filing on a customer's behalf

Staff can create a request from a customer's detail page (07) — the same form the portal shows,
with a customer picker in front of it, `portal_user_id` left null and `contact_id` chosen from
that customer's contacts. This is not a nicety: most customers will phone, and if the phone path
does not land in the same queue the queue stops being the truth.

## 6. Notifications

The in-app half of `../client-portal/06-service-requests.md` §5 renders in the existing
notification center: `service_request_submitted` and `service_request_answered` deep-link
straight to the detail page. No new UI surface — the center already exists.

## 7. Checkpoints

- [ ] **CP-1** — nav entry, queue list with URL filters, age column, default oldest-first
      `submitted`+`needs_info` view, badge count.
- [ ] **CP-2** — detail page: read-only panel, evidence lightbox, timeline, deep-links.
- [ ] **CP-3** — the four actions with their dialogs, role gating, mandatory-reason enforcement
      surfaced from the backend's own errors.
- [ ] **CP-4** — Aprobar y cotizar → quotation editor handoff + the 20 backlink chip.
- [ ] **CP-5** — staff-filed requests from the customer detail page.
- [ ] **CP-6** — notification deep-links + a manual pass over the whole lifecycle.

## 8. Open decisions / asks

- Should `in_review` requests be **assignable** (an owner per request), or is "whoever took it"
  enough? Proposal: whoever took it — an assignment model needs reassignment, handover and a
  workload view, and none of that is worth building before the queue has volume.
- Does a rejected request stay visible to the customer in the portal indefinitely? Proposal:
  yes, with its reason — hiding a rejection reads as a bug to the person who filed it.
