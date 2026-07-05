# 07 — Light CRM

> **Status:** not-started · **Depends on:** 06 (CP-1)
> **Owner:** — · **Last updated:** 2026-07-05

A thin CRM layer **on top of the Customer resource** — no new top-level entity. It owns
the status lifecycle, source tracking views, and the blacklist. Data model (status, source,
blacklistReason) is defined in 06; this module builds the flows and views around it.

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

## 2. Expected API surface

- `POST /customers/:id/status` `{ status, reason? }` — dedicated transition endpoint so
  the backend can audit transitions (preferred over PATCHing the field; confirm).
- `GET /customers?status=...&source=...` — already covered by 06's list endpoint.
- `GET /customers/:id/status-history` *(open decision — nice-to-have audit trail)*

## 3. Pages & components

Routing note: CRM views live **under the Clients nav group** (shell §4: All / Leads /
Blacklist) — they are pre-filtered projections of the customers list, not a separate
sidebar root.

- `crm/pages/leads-list/` — customers list pre-filtered `status=lead`, plus source column
  emphasized and a per-row "convert to active" quick action (opens status dialog).
- `crm/pages/blacklist/` — pre-filtered `status=blacklisted`: name, reason, since, source;
  per-row un-blacklist action (status dialog, confirm-heavy).
- `crm/components/change-status-dialog/` — described above; **mounted in 06's
  customer-view CRM slot** and reachable from list rows here.
- Source analytics (counts per source) on the Dashboard stub — a small card,
  `GET /customers/stats/sources` *(open decision; skip if endpoint slips)*.

Implementation detail: these list pages **reuse 06's table component/state** with locked
filters — if that requires extracting the table into
`customers/components/customers-table/`, coordinate the extraction with 06's agent (record
as ask), don't fork the table.

## 4. State

- Reuses `CustomersState`; adds actions: `ChangeCustomerStatus(id, status, reason?)`.
- Status-history, if approved: `LoadStatusHistory(id)` on the selected customer.

---

## Checkpoints

### CP-1 — Status engine
- [ ] `ChangeCustomerStatus` action + service call
- [ ] Change-status dialog (legal transitions, blacklist reason required)
- [ ] Wired into 06's customer-view CRM slot + customers-list row action

### CP-2 — CRM views
- [ ] Leads view (pre-filtered, convert quick-action)
- [ ] Blacklist view (reason, since, un-blacklist)
- [ ] Nested nav entries under Clients (All / Leads / Blacklist)

### CP-3 — Polish
- [ ] Blacklist warning surfaced where other modules act on a client (coordinate w/ 05)
- [ ] Dark-mode audit; empty states ("no leads yet" etc.)
- [ ] Build green; manual pass: lead → active → blacklist (reason) → appears in blacklist
      view → un-blacklist

## Open decisions / asks
- Transition endpoint vs plain PATCH — backend call.
- Status history audit trail: v1 or later?
- Source stats endpoint for the dashboard card: v1 or later?
- Ask to 06: customers-table extraction for filtered reuse.
