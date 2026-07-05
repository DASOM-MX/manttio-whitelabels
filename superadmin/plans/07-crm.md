# 07 — Light CRM

> **Status:** not-started · **Depends on:** 06 (CP-1)
> **Owner:** — · **Last updated:** 2026-07-05

A thin CRM layer **on top of the Customer resource**. It owns the status lifecycle, source
tracking views, the blacklist, the **per-client activity timeline**, and the **follow-up
date**. Customer *fields* (status, source, blacklistReason, nextFollowUpAt) are defined in
06; the `Interaction` entity below is this module's own resource.

**Scope decided 2026-07-05** (target: small/medium service companies, independent
providers): **no Deal/opportunity entity in v1** — a lead is a client status, as below.
Deals (per-opportunity records with fixed stages `new → contacted → quoted → won/lost`)
are the designated v2 growth path if pipeline tracking is ever needed; likewise a task
system is deliberately reduced to one `nextFollowUpAt` field for now (§3).

---

## 1. Status lifecycle

```
lead ──(won)──▶ active ──▶ disabled ──▶ active   (re-enable)
  │                │
  └──────┬─────────┘
         ▼
    blacklisted ──▶ active | disabled   (un-blacklist, requires confirm)
```

- Every transition goes through a **status-change dialog** (shape 3):
  `crm/components/change-status-dialog/` — target status select (only legal transitions
  offered), **reason required when target is `blacklisted`** (persists to
  `blacklistReason`), optional note otherwise.
- Blacklisted clients: list views badge them `bg-red-100 text-red-900` (pill rule — same
  in dark), and modules that *act on* a client (new bill in 05, new report linkage) show a
  warning; enforcement of "can't transact with blacklisted" is a backend policy — UI
  surfaces it, doesn't invent it.
- Every status transition **emits a `system` timeline entry** (§2) — there is no separate
  status-history table; the timeline *is* the history.

## 2. Activity timeline (decided 2026-07-05)

The relationship history per client — the daily-use heart of the CRM. One append-only
entity:

```
Interaction {
  id, customerId,
  type: 'note' | 'call' | 'whatsapp' | 'email' | 'visit' | 'system',
  body,                                  // free text; for system entries, generated
  ref?: { kind: 'status_change' | 'report' | 'bill', id },   // system entries link out
  userId, createdAt
}
```

- **Manual entries** (`note`/`call`/`whatsapp`/`email`/`visit`): logged by any user with
  clients access via a small composer (type select + textarea) at the top of the timeline.
- **`system` entries** are backend-generated (status changed, report created, bill sent —
  emitters land as those modules integrate; status changes are the v1 emitter) and are
  **immutable, never client-created** — the composer never offers the type.
- **Append-only** (master plan §4 applies): no editing or deleting timeline entries in v1.
  A wrong note is corrected by a follow-up note. (Author-edit of manual notes is an open
  decision below — default is no.)
- Rendered newest-first with type icon, relative date, author; `system` entries styled
  muted with a link when `ref` is present.

### 2.1 Quick-contact actions (decided 2026-07-05)

The bridge that keeps the timeline populated. 06's client 360 header hosts
**WhatsApp / call / email buttons** (`wa.me/<phone>`, `tel:`, `mailto:` — WhatsApp is the
primary channel for this market). Tapping one opens the channel in a new tab/handler
**and** opens the timeline composer pre-filled with the matching type
(`whatsapp`/`call`/`email`) so logging the touch is one save away — never auto-saved
(the user may not complete the contact). The composer exposes this as a small API
(`open(type)`); 06 declares the buttons, 07 owns the behavior.

## 3. Follow-up date (decided 2026-07-05)

Deliberately **not** a task system — one field, defined on the Customer DTO in 06:

- `nextFollowUpAt?` — "don't forget this client." Set/cleared inline from the customer
  view header and offered as an optional date in the change-status dialog (natural moment:
  "left a message, follow up Tuesday").
- Leads view sorts by it ascending (soonest first, nulls last); **overdue** (`< today`)
  renders the date as a red pill in list views.
- Clearing it after the call is manual; logging the call in the timeline is the nudge.
- If real usage demands assignment/multiple tasks per client, that's the v2 task entity —
  don't grow this field into one.

## 4. Expected API surface

- `POST /customers/:id/status` `{ status, reason?, nextFollowUpAt? }` — dedicated
  transition endpoint so the backend can audit transitions (preferred over PATCHing the
  field; confirm). Emits the `system` timeline entry server-side.
- `GET /customers/:id/interactions?page&limit` → paged, newest-first.
- `POST /customers/:id/interactions` `{ type, body }` — manual types only; backend
  rejects `system`.
- `nextFollowUpAt` travels on the normal `PATCH /customers/:id` (06's endpoint).
- `GET /customers?status=...&source=...` — already covered by 06's list endpoint.

## 5. Pages & components

Routing note: CRM views live **under the Clients nav group** (shell §4: All / Leads /
Blacklist) — they are pre-filtered projections of the customers list, not a separate
sidebar root.

- `crm/pages/leads-list/` — customers list pre-filtered `status=lead`, sorted by
  `nextFollowUpAt` (§3), source column emphasized, follow-up column with overdue pill, and
  a per-row "convert to active" quick action (opens status dialog).
- `crm/pages/blacklist/` — pre-filtered `status=blacklisted`: name, reason, since, source;
  per-row un-blacklist action (status dialog, confirm-heavy).
- `crm/components/change-status-dialog/` — described above (+ optional follow-up date,
  §3); **mounted in 06's customer-view CRM slot** and reachable from list rows here.
- `crm/components/customer-timeline/` — §2's timeline + composer, **mounted in 06's
  customer-view CRM slot** below the status card. Paged "load more", empty state
  ("no activity yet — log the first call").
- Source analytics (counts per source) on the Dashboard stub — a small card,
  `GET /customers/stats/sources` *(open decision; skip if endpoint slips)*.

Implementation detail: these list pages **reuse 06's table component/state** with locked
filters — if that requires extracting the table into
`customers/components/customers-table/`, coordinate the extraction with 06's agent (record
as ask), don't fork the table.

## 6. State

- Reuses `CustomersState`; adds actions: `ChangeCustomerStatus(id, status, reason?,
  nextFollowUpAt?)`, plus `interactions` on the selected customer:
  `LoadInteractions(customerId, page?)`, `AddInteraction(customerId, type, body)`.

---

## Checkpoints

### CP-1 — Status engine
- [ ] `ChangeCustomerStatus` action + service call
- [ ] Change-status dialog (legal transitions, blacklist reason required, optional
      follow-up date)
- [ ] Wired into 06's customer-view CRM slot + customers-list row action

### CP-2 — Timeline
- [ ] `Interaction` DTO + service endpoints + state actions
- [ ] `customer-timeline` component (composer, paged list, system-entry styling)
- [ ] Composer `open(type)` API + 06's quick-contact buttons wired (§2.1)
- [ ] Mounted in 06's customer-view; status change → system entry appears in timeline

### CP-3 — CRM views + follow-ups
- [ ] Leads view (pre-filtered, follow-up sort + overdue pill, convert quick-action)
- [ ] Blacklist view (reason, since, un-blacklist)
- [ ] `nextFollowUpAt` set/clear inline on customer view header
- [ ] Nested nav entries under Clients (All / Leads / Blacklist)

### CP-4 — Polish
- [ ] Blacklist warning surfaced where other modules act on a client (coordinate w/ 05)
- [ ] Dark-mode audit; empty states ("no leads yet", "no activity yet")
- [ ] Build green; manual pass: lead (follow-up date set → overdue pill) → log a call →
      active (system entry in timeline) → blacklist (reason) → appears in blacklist view
      → un-blacklist

## Open decisions / asks
- Transition endpoint vs plain PATCH — backend call.
- ~~Status history audit trail: v1 or later?~~ — **resolved 2026-07-05:** subsumed by the
  timeline; status changes are `system` interactions (§2).
- Author-edit/delete of *manual* timeline entries: default **no** (append-only, §2) —
  revisit only if typo pain is real.
- Which system-event emitters beyond status changes land in v1 (report created, bill
  sent) — depends on backend hooks; timeline renders whatever arrives.
- Source stats endpoint for the dashboard card: v1 or later?
- Ask to 06: customers-table extraction for filtered reuse.
- **v2 (recorded, not planned):** Deal entity with fixed stages
  `new → contacted → quoted → won/lost` (decided fixed, not tenant-configurable, when it
  lands); task entity if `nextFollowUpAt` proves too small.
