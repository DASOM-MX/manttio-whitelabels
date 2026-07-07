# 08 — Light CRM

> **Status:** done (frontend side — backend Interaction entity + transition endpoint pending)
> **Depends on:** 07 (CP-1, done)
> **Owner:** branch `feature/superadmin-crm` (stacked on the 07 customers PR) · **Last updated:** 2026-07-06

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

The bridge that keeps the timeline populated. 07's client 360 header hosts
**WhatsApp / call / email buttons** (`wa.me/<phone>`, `tel:`, `mailto:` — WhatsApp is the
primary channel for this market). Tapping one opens the channel in a new tab/handler
**and** opens the timeline composer pre-filled with the matching type
(`whatsapp`/`call`/`email`) so logging the touch is one save away — never auto-saved
(the user may not complete the contact). The composer exposes this as a small API
(`open(type)`); 07 declares the buttons, 08 owns the behavior.

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
- `nextFollowUpAt` travels on the normal `PATCH /customers/:id` (07's endpoint).
- `GET /customers?status=...&source=...` — already covered by 07's list endpoint.

### 4.1 Read-path caching — per-tenant Durable Object (decided 2026-07-06)

Hot CRM reads are served from the **per-tenant cache Durable Object** (the same
SQLite-backed `TenantCacheDO` that caches the brand — 03 §5.1), not straight from Neon:

- Cached: the list projections behind the CRM views (leads sorted by follow-up,
  blacklist, source counts for the dashboard card) and the first timeline page per
  customer. The exact v1 projection set is a backend open question — the UI never
  knows or cares which path served a read.
- **Write-through invalidation:** the CRM write endpoints (`POST /customers/:id/status`,
  `POST /customers/:id/interactions`, `PATCH /customers/:id`) commit to Neon first,
  then refresh/drop the affected entries in the same request — a just-logged call must
  appear on the timeline the composer reloads (read-your-writes).
- Bindings, migration, TTL sweep, and the cache-aside pattern live backend-side —
  `backend/manttio-whitelabeled-backend-plan.md` §5. Neon remains the source of truth;
  the DO is a disposable cache.

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
  §3); **mounted in 07's customer-view CRM slot** and reachable from list rows here.
- `crm/components/customer-timeline/` — §2's timeline + composer, **mounted in 07's
  customer-view CRM slot** below the status card. Paged "load more", empty state
  ("no activity yet — log the first call").
- Source analytics (counts per source) on the Dashboard stub — a small card,
  `GET /customers/stats/sources` *(open decision; skip if endpoint slips)*.

Implementation detail: these list pages **reuse 07's table component/state** with locked
filters — if that requires extracting the table into
`customers/components/customers-table/`, coordinate the extraction with 07's agent (record
as ask), don't fork the table.

## 6. State

- Reuses `CustomersState`; adds actions: `ChangeCustomerStatus(id, status, reason?,
  nextFollowUpAt?)`, plus `interactions` on the selected customer:
  `LoadInteractions(customerId, page?)`, `AddInteraction(customerId, type, body)`.

---

## Checkpoints

### CP-1 — Status engine
- [x] `ChangeCustomerStatus` action + `POST /customers/:id/status` service call
- [x] Change-status dialog (legal transitions from
      `model/constants/customer/status-transitions.const`, blacklist reason
      required, optional follow-up date)
- [x] Wired into 07's customer-view CRM slot + leads/blacklist row quick actions

### CP-2 — Timeline
- [x] `Interaction` DTO + service endpoints + state actions (page 1 replaces —
      read-your-writes reload; later pages append)
- [x] `customer-timeline` component (composer with manual types only, paged
      "Cargar más", muted system entries w/ report links, relative-time pipe)
- [x] Composer `open(type)` API + quick-contact buttons open the channel AND
      pre-fill the composer — never auto-saved (§2.1)
- [x] Mounted in 07's customer-view; status change → system entry verified

### CP-3 — CRM views + follow-ups
- [x] Leads view (pre-filtered, follow-up column w/ overdue red pill, sort by
      follow-up server-side, convert quick-action)
- [x] Blacklist view (reason column, un-blacklist quick action → dialog preset
      `active`)
- [x] `nextFollowUpAt` set/clear inline on the CRM card (saves on change)
- [x] Nested nav entries under Clients (shipped with 02/07)

### CP-4 — Polish
- [~] Blacklist warning where other modules act on a client — the CRM card
      surfaces the reason; 09 (billing) must surface it at bill creation
      (recorded ask, module not built yet)
- [x] Dark-mode variants; empty states ("Sin actividad todavía…")
- [x] Build green; headless pass 14/14 (2026-07-06): leads follow-up column +
      convert action, composer + manual call, WhatsApp quick-contact pre-fill,
      blacklist transition (reason gate) → system entry → blacklist view →
      un-blacklist preset

## Open decisions / asks
- Transition endpoint vs plain PATCH — backend call.
- ~~Status history audit trail: v1 or later?~~ — **resolved 2026-07-05:** subsumed by the
  timeline; status changes are `system` interactions (§2).
- Author-edit/delete of *manual* timeline entries: default **no** (append-only, §2) —
  revisit only if typo pain is real.
- Which system-event emitters beyond status changes land in v1 (report created, bill
  sent) — depends on backend hooks; timeline renders whatever arrives.
- Source stats endpoint for the dashboard card: v1 or later?
- Which CRM projections the tenant-cache DO holds in v1 (§4.1) — backend call, with the
  invalidation hooks.
- Ask to 07: customers-table extraction for filtered reuse.
- **v2 (recorded, not planned):** Deal entity with fixed stages
  `new → contacted → quoted → won/lost` (decided fixed, not tenant-configurable, when it
  lands); task entity if `nextFollowUpAt` proves too small.
