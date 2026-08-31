# 27 — Service requests (staff triage)

> **Status:** planned (doc) · **Depends on:** 07 (clients), 11 (equipment), 20 (quotations),
> `../client-portal/01-data-model.md` + `../client-portal/06-service-requests.md`
> **Owner:** — · **Last updated:** 2026-08-31

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
  on somebody. `in_review` is somebody's open work; `rejected` / `closed` are history.
- **`approved` is a separate view, not part of the default queue** — the A6 amendment
  (`../client-portal/06-service-requests.md` §4b) made `approved` non-terminal, and only the
  customer's portal admin can retire a request. Approved requests therefore accumulate
  indefinitely by design. A second tab, *"Cotizadas — esperando al cliente"*, holds them; the
  main queue stays the list of things a staff member must act on today. Mixing the two is how
  the queue stops being read.
- Columns: folio, customer, equipment, description excerpt, filed by (contact), age, status.
  The *Cotizadas* tab swaps `age` for **quotations attached** (count + the newest folio) — a
  request on its third quote is the one worth looking at.
- **Age is the column that matters.** A request sitting three days in `submitted` is the
  failure mode this whole module exists to prevent — surface it, sort by it, and let the
  default sort be oldest-first, not newest-first.
- Row click → detail. No inline actions on the list; every action is a decision that wants the
  full context.

## 3. Detail

Read-only left column: customer (deep-link to 07), equipment (deep-link to 11 with its service
history), the customer's verbatim description, evidence images in a lightbox, filed-by contact
and portal user, folio, dates.

**When the request arrived without equipment (A9/A17):** the equipment slot renders as an
actionable empty state — *"Sin equipo registrado"* plus **"Registrar equipo"**, which opens
module 11's create form prefilled with this customer, and on save attaches the new record to the
request (`equipment_id` set, `changes` recording it on the timeline). It is an **affordance, not
a gate**: every action below stays available with the slot empty, approval included. A customer
who cannot name their unit in our registry still has a broken chiller, and a triage screen that
demands data entry before it lets anyone act is a triage screen people route around.

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
| **Cotizar de nuevo** | `approved` | Opens a **new** draft quotation against the same request (§4), after the client declined the previous one. Never automatic — see `../client-portal/06-service-requests.md` §4b. |

**There is no staff "cerrar" action, deliberately** (A6). Staff may reject a request they will
not take; once taken, only a portal user with `is_admin` closes it. If a staff member believes a
request is finished and the customer has not closed it, the answer is a phone call, not a
button — and the *Cotizadas* tab is where it waits meanwhile.

No edit affordance on the customer's description, ever — the request is evidence.

## 4. Aprobar y cotizar

One confirm dialog, one transaction (`../client-portal/06-service-requests.md` §4), and the
staff member lands **in the new quotation's editor** with the request's context already in the
terms block. The moment of approval is the moment somebody is ready to price the work; making
them navigate to Cotizaciones and start from an empty form is how the link gets lost.

The quotation detail page (20) gains a **"Origen: solicitud SOL-…"** backlink chip, read from
`quotations.service_request_id` (`../client-portal/01-data-model.md` §6b).

**A request may hold several quotations.** The link lives on the quotation, not the request, so
the detail page lists them all — folio, status, date — newest first, with the declined ones
still visible. That list *is* the commercial history of the request.

## 5. Filing on a customer's behalf

Staff can create a request from a customer's detail page (07) — the same form the portal shows,
with a customer picker in front of it, `portal_user_id` left null and `contact_id` chosen from
that customer's contacts. This is not a nicety: most customers will phone, and if the phone path
does not land in the same queue the queue stops being the truth.

## 6. Notifications

The in-app half of `../client-portal/06-service-requests.md` §5 renders in the existing
notification center: `service_request_submitted`, `service_request_answered` and
**`service_request_closed`** deep-link straight to the detail page. No new UI surface — the
center already exists.

`service_request_closed` is the one staff cannot cause themselves, and it is how a request
leaves the *Cotizadas* tab without anyone here doing anything.

## 7. Checkpoints

- [ ] **CP-1** — nav entry, queue list with URL filters, age column, default oldest-first
      `submitted`+`needs_info` view, the separate *Cotizadas* tab, badge count.
- [ ] **CP-2** — detail page: read-only panel, evidence lightbox, timeline, deep-links.
- [ ] **CP-3** — the five actions with their dialogs, role gating, mandatory-reason enforcement
      surfaced from the backend's own errors, and **no close affordance anywhere**.
- [ ] **CP-4** — Aprobar y cotizar → quotation editor handoff, the 20 backlink chip, the
      per-request quotation list, and *Cotizar de nuevo*.
- [ ] **CP-5** — staff-filed requests from the customer detail page.
- [ ] **CP-6** — notification deep-links + a manual pass over the whole lifecycle.

## 8. Open decisions / asks

- Should `in_review` requests be **assignable** (an owner per request), or is "whoever took it"
  enough? Proposal: whoever took it — an assignment model needs reassignment, handover and a
  workload view, and none of that is worth building before the queue has volume.
- Does a rejected request stay visible to the customer in the portal indefinitely? Proposal:
  yes, with its reason — hiding a rejection reads as a bug to the person who filed it.
- ~~**A17** — must staff attach equipment before approving?~~ **Resolved 2026-08-31: no.** The
  record can be created from the request view (§3), but nothing requires it.
