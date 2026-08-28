# client-portal / 05 — Quotation approval in the portal

> **Status:** planned (doc) · **Depends on:** 04 · **Owner:** — · **Last updated:** 2026-08-28

A second entrance to a decision that already exists. The emailed token page
(`/public/quotations/:token`) **stays** (00 §3.10) — this adds an authenticated path for
contacts who have portal access, and it must be the *same* decision, not a parallel one.

---

## 1. One service, two entrances

`POST /portal/quotations/:id/respond` resolves the acting contact from the **token**
(`portalUser.contactId`) and then calls the existing `respondToQuotation` service —
unchanged, un-forked. The token page resolves the contact from the URL secret and calls the
same function.

This is the whole design. Everything that makes quotation responses correct already lives in
that service and must not be reimplemented:

- reviewer-vs-informational recipient check (`NotAReviewerError`)
- closed-quote refusal (`QuotationClosedError`)
- mandatory reason on decline
- the tally re-derive across `TALLY_STATUSES`
- the `quotation_events` row written **inside** the same transaction

## 2. Attribution

The portal writes the event exactly like the token page does: `contactId` set, **`actorId`
null**. A portal response is a client action and must never be able to look like a staff one
in the trail (`quotation_events` says so in its own comment).

Proposal: `changes` gains `{ via: 'portal' }` on portal-originated responses, so the trail can
distinguish "clicked the emailed link" from "logged in and decided" without adding a column or
a second event type. Cheap, additive, and the timeline renderer can ignore it.

## 3. Who sees the buttons

The decision affordance renders only when **all** of:

1. the portal user holds `approve_quotations`;
2. their contact is a **reviewer** recipient on this quotation;
3. the quotation is in a live tally status.

If (1) holds but (2) does not, the quotation is still readable (with `view_quotations`) and the
page states plainly that this contact is not a reviewer on it — that is information the
customer benefits from, and the record is already visible, so this is a **403 with the
backend's verbatim message**, not the 404 the scope rule mandates for records the user may not
see at all.

## 4. Minds change

A declined quotation is a **live** state, and reviewers may respond again — the tally re-derives
on every response. The portal must reflect that rather than freezing the UI after one click:
the current decision is shown as the user's standing answer, and changing it is available
until the quote reaches a staff terminal state (`cancelled` / `order_created`). Every change is
another event row; the sequence is the evidence.

## 5. Not in scope

- No new email. The quotation send flow already mails reviewers; adding a portal link to that
  email is a one-line template change tracked in superadmin 26's rollout, not a new channel.
- No renegotiation, comments or counter-offers in v1. A customer who wants changes uses the
  decline reason or a service request.

## 6. Checkpoints

- [ ] **CP-1** — `POST /portal/quotations/:id/respond` delegating to `respondToQuotation`;
      tests asserting a portal response and a token response produce identical event rows
      apart from `changes.via`.
- [ ] **CP-2** — portal detail-page decision UI (approve / decline + mandatory reason),
      standing-answer display, live-status gating.
- [ ] **CP-3** — the non-reviewer and closed-quote states rendered from the backend's own
      error messages.
