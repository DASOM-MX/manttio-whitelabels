# 12 — Calendar (scheduled visits)

> **Status:** in-progress (CP-1/1b/2/3/4/4b built — PRs #110/#127/#128/#129/#132 + QA fixes #130; manual passes for CP-2/CP-3 + CP-4's network-kill re-sync still open; next: CP-5 Google Calendar, blocked on Google verification) · **Depends on:** 02 (CP-3), 05 (tech roster), 07 (CP-1), 19 (visits are order-bound)
> **Owner:** — · **Last updated:** 2026-08-07

Team scheduling: who goes where, when. Owns the **`ScheduledVisit`** entity (order-bound,
19 §1) and the calendar views. **Immutable-record model (decided 2026-07-23):** office
schedules and — while a visit is still open — corrects/reassigns it; the assigned
technician then **responds** (serves) or **closes** it with a categorized reason and is
prompted to **reschedule** (a new linked record) now or later. Nothing is edited after a
tech acts, and **every action audits to the parent service order's timeline (19 §7)** —
never to the visit — so the whole job history hands off to the client at service end.

A visit is a *plan*; a report (06) is what *happened*. They link (`reportId` set on
completion) but neither replaces the other.

---

## 1. Data model (DTO view)

```
ScheduledVisit {                // IMMUTABLE record (decided 2026-07-23) — see below
  id,
  internalCode,                 // `V-YYYYMMDD-NNNN` (owner 2026-08-02) — backend-minted
                                //   from a daily counter, NOT NULL, unique among live
                                //   rows, never staff-authored. The human handle: what
                                //   people read out, paste into search, write on a slip
  customerId,
  serviceOrderId,               // REQUIRED (2026-07-23, 19 §1) — every visit belongs
                                //   to exactly one service order; the client derives
                                //   from the order
  // contract link lives on the parent order, not here (2026-07-23): orders MAY
  // generate a contract (19 §1); a visit's contract is derived via its order
  equipmentIds?: string[],      // units to service (11), optional
  technicianId?,                // null = unassigned (backlog lane) — mutable while
                                //   `scheduled` (reassignment); audited at order level

  // --- PLANNED (what office booked) ---
  scheduledStart,               // datetime
  scheduledEnd?,                // kept as a fast reference (owner 2026-07-31) — the
                                //   expected end, denormalized from start+expected
                                //   duration so a range read needs no arithmetic
  expectedDurationMinutes,      // REQUIRED, default 60 (owner 2026-07-31) — the
                                //   planned length; drives the calendar block height

  // --- ACTUAL (what happened) — plan-vs-actual, owner 2026-07-31 ---
  actualStart?,                 // stamped by the field app's Iniciar
  actualEnd?,                   // stamped by the field app's Terminar
  actualDurationMinutes?,       // stored, not derived: a tech may report a length
                                //   whose exact stamps never made it (offline gap)

  status: 'scheduled' | 'in_progress' | 'completed' | 'closed',
                                //   in_progress added 2026-07-31 (see below);
                                //   terminal once completed/closed
  closeReason?,                 // category enum, REQUIRED on close (2026-07-23):
                                //   client_cancelled | client_absent | no_access
                                //   | tech_unavailable | other
  closeNote?,                   // optional free text alongside the category
  rescheduledFromId?,           // chain link: the closed visit THIS one replaces
  reportId?,                    // set when the visit produced a report
  title?,                       // short label; defaults to customer name
  notes?,
  createdBy, createdAt
}
```

- **Immutable records (decided 2026-07-23).** A visit is fixed at creation. While it is
  still `scheduled` (open, no tech action yet) office may correct scheduling fields
  (date/title/notes) and reassign the technician — the *only* permitted mutations. Once
  a tech acts, the record is terminal: no edits, no reopen.
  **Amended 2026-07-31 (owner)** on two points: (a) `in_progress` freezes **scheduling
  correction** — office must not move the date of a visit a technician is physically
  performing (409) — but **reassignment stays open and audited**, because a mid-job
  handoff is real: a tech falls ill and a colleague takes the job over. (b) The
  **actuals are correctable** by owner/admin on a terminal visit — see the
  plan-vs-actual bullet.
- **Plan vs actual (decided 2026-07-31, owner).** A visit carries what was *booked*
  (`scheduledStart` / `scheduledEnd` / `expectedDurationMinutes`) alongside what
  *happened* (`actualStart` / `actualEnd` / `actualDurationMinutes`). The contrast is
  the point: it measures how well the shop estimates, and it is the raw material for
  **billing by real time** later. `expectedDurationMinutes` is **required with a
  60-minute default** — which **supersedes** the "many SMB visits are morning-ish, an
  optional end invents no precision" rationale below: every visit now has a planned
  length, because the calendar renders it as a block and a block needs a height.
  `scheduledEnd` is **kept** rather than derived, as a fast reference for range reads;
  the service writes both together so they can never disagree.
  **Correcting actuals (2026-07-31, owner):** owner/admin may fix `actualStart` /
  `actualEnd` on a terminal visit, each correction appending its own event to the
  order timeline. This narrowly supersedes "no edits once terminal" — a mis-tapped
  Iniciar would otherwise bill wrong forever, and the audited correction keeps the
  trail honest about both the original value and the fix.
- **Respond or close (decided 2026-07-23).** The assigned technician either **responds**
  — serves it → `completed`, producing/linking the report — or **closes** it with a
  **categorized reason** (`client_cancelled | client_absent | no_access |
  tech_unavailable | other`) + optional note. There is no in-place cancel/miss edit and
  no reopen; a closed visit is done.
- **Iniciar / Terminar live in the field app (decided 2026-07-31, owner).** The
  technician starts and ends the job from `frontend/` (the field app), not the admin:
  **Iniciar** stamps `actualStart` and moves `scheduled → in_progress`; **Terminar**
  *is* the existing `/respond` — it stamps `actualEnd` + `actualDurationMinutes` and
  completes the visit. `in_progress` **supersedes** "`scheduled` is the only open
  state": office needs to see who is on site right now.
  Both actions are **offline-first**: the field app queues them in IndexedDB and syncs
  on reconnect, so the API takes a **client-supplied timestamp** (the trusted-field
  posture already used for `created_by` on synced reports) instead of stamping
  `now()`. A tech in a basement at 09:15 must not record 11:40 when the truck regains
  signal — that would bill a job that took minutes.
- **Reschedule = a new record, prompted now/later (decided 2026-07-23).** After closing,
  the tech is asked through a dialog whether to reschedule **now or later**. Rescheduling
  **creates a new `scheduled` record** (never edits the closed one): `rescheduledFromId`
  → the closed visit, same order/customer/title/notes, new date/time, technician defaults
  to the closed visit's (overridable). "Later" just means the successor is created from
  the closed visit whenever staff/tech return to it. Techs may reschedule their own
  visits; office/admin/owner any.
- **Audit lives at the service-order level, not here (decided 2026-07-23).** There is
  **no** visit-level event log. Every visit lifecycle event — created, reassigned
  (`from → to, by whom`), corrected, responded, closed (reason), rescheduled (→ new
  visit) — is appended to the parent order's **activity timeline** (19 §7), alongside
  order and report events, so the whole history can be **handed to the client at the end
  of the service**. (Supersedes the visit-level `visit_events` table on the
  `feature/fullstack-calendar-module` branch / PR #97 — folded into the order timeline
  when 19 lands.)
- `completed` is set when the tech responds/serves (report linked); staff may also set
  it manually.

## 2. Roles (extends `14-access-control.md` §2)

| Action | owner | admin | office | technician |
|---|---|---|---|---|
| See the full team calendar | ✓ | ✓ | ✓ | ✓ (read-only) |
| Create visits | ✓ | ✓ | ✓ | — |
| Correct a **scheduled** visit (date/title/notes) | ✓ | ✓ | ✓ | — |
| Reassign a **scheduled or in-progress** visit | ✓ | ✓ | ✓ | — |
| **Swap own** open visit to another tech | — | — | — | ✓ᵃ |
| **Iniciar** (start work → in_progress) | ✓ | ✓ | ✓ | ✓ (own) |
| **Terminar / Respond** (serve → completed) | ✓ | ✓ | ✓ | ✓ (own) |
| **Close** with categorized reason | ✓ | ✓ | ✓ | ✓ (own) |
| **Reschedule** a closed visit (new record) | ✓ | ✓ | ✓ | ✓ (own) |
| **Correct the actuals** on a terminal visit | ✓ | ✓ | — | — |

Correcting actuals is admin-tier only (2026-07-31): office schedules work, but rewriting
what a technician recorded as *done* is a billing-grade edit — it belongs with the roles
that answer for the invoice. Every correction is audited to the order timeline.

a. **Tech swap:** a technician can hand off an *open* visit currently assigned to *them*
   to another technician (mutual coverage — "take my Tuesday"). It goes through the same
   reassignment endpoint, is audited identically (at the order level), and requires no
   approval in v1 (open decision below if that proves too loose). Techs cannot pull
   visits *from* colleagues — only give away their own. Once a visit is
   completed/closed it is immutable, so swaps only apply while `scheduled`.

## 3. Calendar UI (decided direction)

**No FullCalendar in v1.** Start with a custom Tailwind-built **week grid + day agenda**:

- **Time-axis grid (decided 2026-07-31, owner — supersedes the stacked-chip week view
  below).** `calendar/pages/calendar/` renders a real **24-hour scrollable time axis**:
  hour rows down the left, one column per day, and each visit as a **block positioned
  and sized by its times**. The grid **opens at 00:00, not at business hours** — the
  shop takes emergency calls at midnight and a view that hides them is worse than one
  with dead space at the top. Overlapping visits split their day column side by side.
  - **Planned ghost + actual solid.** A visit that has actuals draws **twice**: the
    booked slot as a faint dashed outline, the real one as the solid block on top. The
    over- or under-run is then readable across the whole week without opening anything
    — which is the entire reason the actuals are captured.
  - Blocks color by status (scheduled = primary, **in_progress = live accent**,
    completed = green, closed = muted/struck).
- ~~week view: one column per day; visit chips (time, client, tech color-dot) stacked
  per day~~ — **superseded 2026-07-31** by the time-axis grid above. The filter chrome
  survives unchanged: a technician `<p-multiselect>` + "unassigned" toggle, month
  `<p-datepicker>` jump, prev/today/next. Mobile collapses to a single-day agenda list.
- Clicking a chip opens the **visit dialog** (§4); moving a visit is dialog-driven
  (change date/tech) — **no drag-and-drop in v1**. If drag/drop becomes a real ask,
  evaluate FullCalendar's Angular adapter then (compat with Angular 21 + zoneless
  unverified — recorded as the open decision, not assumed).
- Technician mode: same page, pre-filtered to **My visits** with a "team" read-only
  toggle; the only action their own chips offer is **Swap** (§2a).
- Visit chips color by status (scheduled = primary, completed = green, closed =
  muted/struck — the close reason shows on hover/detail) — pill/dark-mode rules per 01.
  A closed visit that has a reschedule successor links to it.

## 4. Pages & components

- `calendar/pages/calendar/` — §3.
- `calendar/components/visit-dialog/` — shape-3, create/edit: **service-order select**
  (searchable, required — 2026-07-23 amendment, supersedes the client select: the
  client derives from the order; order view opens the dialog with the order locked),
  equipment multiselect (scoped to client, from 11 — hidden until 11 lands), technician
  select (with "unassigned"), date + start time + **duration** (2026-07-31: required,
  defaults to 60 min — it sizes the calendar block), title, notes. Edit mode adds
  the tech action buttons — **Responder** (serve → completed) and **Cerrar** (close with
  a categorized reason) — plus office correction (date/duration/title/notes) while
  `scheduled`, and reassignment while `scheduled` **or** `in_progress`. Once
  completed/closed the dialog is read-only apart from the admin-tier actuals
  correction. A visit with actuals shows **Planeado vs Real** side by side with the
  variance (`+25 min`) — the one place the numbers are read per visit. The full history
  is **not** shown here — it lives on the parent order's activity timeline (19 §7).
- `calendar/components/correct-actuals-dialog/` — owner/admin only, terminal visits
  (2026-07-31): edits `actualStart` / `actualEnd`, shows the recomputed duration before
  saving, and states plainly that the change lands on the order's timeline.
- `calendar/components/close-visit-dialog/` — the categorized close: reason select
  (`client_cancelled | client_absent | no_access | tech_unavailable | other`) + optional
  note; on confirm, prompts **reschedule now / later** (now → opens the reschedule dialog
  pre-filled from the just-closed visit; later → dismiss).
- `calendar/components/reschedule-visit-dialog/` — creates the successor `scheduled`
  record (new date/time, technician defaults to the closed visit's), `rescheduledFromId`
  → the closed visit.
- `calendar/components/swap-visit-dialog/` — the technician's handoff on an open visit:
  target tech select + optional note; confirm-heavy copy ("X will see this visit as theirs").
- Dashboard hook: a "today's visits" card on the Dashboard stub (count + first few,
  link to calendar) — small, do it here since the data is this module's.

### Field app (`frontend/`) — decided 2026-07-31

The technician's half of this module lives in the **field app**, which today has no
visit surface at all (its features are auth, customers, reports, users). It is a new
module there, not two buttons:

- `visits/pages/my-visits/` — the tech's own visits, today first: order folio, client,
  address, time, and the primary action for the visit's state (**Iniciar** while
  `scheduled`, **Terminar** while `in_progress`, nothing once terminal).
- `visits/pages/visit-detail/` — what the job is: order + client + equipment + notes,
  with Iniciar / Terminar / Cerrar. Kept deliberately thin — the field app is used
  one-handed on a phone in a plant room.
- **Offline queue (`src/offline/`).** The existing store is reports-only
  (`pendingReports`, Dexie v1). Visit actions get their **own store** at **Dexie v2**
  (`pendingVisitActions: { visitId, action, at, syncedAt }`) and their own sync pass in
  `offline-sync.service`, reusing the reconnect watcher the reports queue already has.
  Each queued action carries the **local timestamp of the tap**, which is what the API
  records — the whole point of queueing rather than replaying.
  - **Conflict rule (open — see below):** two Iniciar taps on one visit, or a Terminar
    that syncs before its Iniciar, must resolve deterministically.

## 5. Expected API surface

- `GET /visits?from&to&internalCode&technicianId&customerId&status` → list for the
  visible range (calendar loads by week; no pagination). **Either** `from`+`to` **or**
  `internalCode` is required (owner 2026-08-02): the range is the calendar's viewport,
  and the code is the one legitimate unbounded selector — you cannot be made to know
  which week a visit is in before you can look it up. `internalCode` is a **prefix**
  match (`V-2026` = a year, `V-20260802` = a day, a full code = one visit), all served
  by the unique btree; a `%fragment%` search was rejected because it would require
  `pg_trgm` in every tenant database
- `GET /visits/:id` — the immutable record + its close/reschedule chain (audit trail is
  on the order, not here — 19 §7)
- `POST /visits` — create (staff); takes `expectedDurationMinutes` (default 60) and
  derives `scheduledEnd` from it. **`scheduledEnd` is never an input on any endpoint**
  (2026-07-31): the service writes it as `scheduledStart + expectedDurationMinutes` on
  every path that touches either, which is the only way the two cannot drift apart
- `PATCH /visits/:id` — **scheduled-only correction** (date/duration/title/notes; **not**
  technicianId, **not** once `in_progress` or terminal) → 409 `visit_not_correctable`
  otherwise; logs a `visit_corrected` event to the order timeline carrying only the
  *authored* fields, since `scheduledEnd` is derived and would double-report the move
- `POST /visits/:id/assign` `{ technicianId }` — reassignment while **scheduled or
  in_progress** (2026-07-31: a mid-job handoff is real); backend enforces the tech-swap
  rule (requester is tech ⇒ current assignee must be requester) → logs
  `visit_reassigned` (`from → to, by whom`) to the order timeline
- `POST /visits/:id/start` `{ actualStart }` — **Iniciar** (field app): stamps
  `actualStart`, `scheduled → in_progress` → logs `visit_started`. The timestamp is
  **client-supplied** so an offline start records when it happened, not when it synced;
  validated (not in the future, not before the visit was created) but trusted, the same
  posture as `created_by` on synced reports
- `POST /visits/:id/respond` `{ actualEnd?, reportId? }` — **Terminar**: serve →
  `completed`, stamping `actualEnd` + `actualDurationMinutes` (links the report) → logs
  `visit_completed`. Same client-supplied-timestamp rule as `/start`
- `PATCH /visits/:id/actuals` `{ actualStart?, actualEnd? }` — **owner/admin only**,
  terminal visits: corrects a mis-tapped or mis-synced stamp, recomputes
  `actualDurationMinutes`, logs `visit_actuals_corrected` with the before/after diff
- `POST /visits/:id/close` `{ reason, note? }` — categorized close → `closed` → logs
  `visit_closed`
- `POST /visits/:id/reschedule` `{ scheduledStart, expectedDurationMinutes?,
  technicianId? }` → new `scheduled` record from a **closed** visit
  (`rescheduledFromId` set, its own fresh `internalCode`, duration inherited unless
  overridden, actuals deliberately *not* copied) → logs `visit_rescheduled` (→ new
  visit); techs may do this for their own visit
- All mutation endpoints append to the **parent order's activity timeline** (19 §7) —
  there is no visit-level audit table
- `GET /customers/:id/visits` — upcoming visits on the customer view (07 slot — ask)
- `GET /visits/external?from&to` → `ExternalEvent[]` for connected users in range (§7;
  short-cached server-side; title redacted per privacy rule; client matching by
  attendee/organizer email done server-side — the raw attendee list never reaches the
  frontend)
- `GET /integrations/google/status` · `GET /integrations/google/connect` (OAuth
  redirect) · `POST /integrations/google/disconnect` — own account only

## 6. State

- `VisitsState`: `range`, `visits`, `externalEvents`, `loading`, `selected`,
  `googleStatus` (own connection). Actions: `LoadVisits(from, to, filters)` (also loads
  external events for the range), `LoadVisit(id)`, `CreateVisit`, `CorrectVisit(id,
  fields)` (scheduled only), `AssignVisit(id, technicianId)` (scheduled or in_progress),
  `StartVisit(id, actualStart)`, `RespondVisit(id, actualEnd?)`,
  `CloseVisit(id, reason, note?)`, `RescheduleVisit(id, whenFields)`,
  `CorrectVisitActuals(id, fields)` (owner/admin), `LoadGoogleStatus`,
  `DisconnectGoogle` (connect is a redirect, not an action).
- `src/app/services/http/visits.service.ts` (per the app's real layout — not `src/http/`).

## 7. Google Calendar integration — push + external overlay (decided 2026-07-05)

Per-user **OAuth** so no date falls through the cracks — **including events created
outside the admin**. Two directions, deliberately asymmetric:

- **Outbound — visits push to Google.** When a visit is created/updated/cancelled and
  the affected user has connected their account, the backend mirrors it as an event on
  their **primary** Google calendar (`extendedProperties.private.visitId` correlation;
  update/cancel replace by that key). **The app stays source of truth for visits**: edits
  made in Google to a pushed event are ignored and overwritten on the next push — never
  read back into the visit.
- **Inbound — external events as a read-only overlay.** For the visible range, the
  backend fetches connected users' Google events (`events.list` with `timeMin/timeMax`),
  filters out our own pushed events (they carry `visitId`), and returns the rest as
  **`ExternalEvent { userId, start, end, title?, matchedCustomerId?,
  matchedCustomerName? }`** — rendered as muted/striped read-only chips in the week
  grid. External events are **never imported as `ScheduledVisit`s** and never stored
  beyond a short cache: they're busy-context so office doesn't double-book a tech, not
  schedulable objects. That's what keeps the append-only audit untouched and makes this
  *not* two-way sync (**two-way write-back stays rejected** — webhook channels, renewal
  crons, and conflict resolution buy nothing here).

  **Client matching by email (decided 2026-07-05):** at fetch time the backend compares
  the event's `attendees[].email` (+ organizer, excluding the connected user themselves)
  against the tenant's client emails — `Customer.email`, `fiscal.billingEmail`,
  `contacts[].email` — case-insensitive exact match. One unambiguous hit ⇒ the chip
  carries a **client tag linking to the customer view** ("Ocupado — Hotel X"); zero hits
  or an email shared by several clients ⇒ unmatched, plain busy chip (never guess). The
  match is computed per fetch, display-only — nothing persists, so a client email edit
  simply changes future matches. The **client tag is visible to all staff roles** (it's
  derived from the tenant's own client data) even where the title stays owner-only.
  Payoff action: a matched chip offers **"Crear visita"** (staff only) — opens the visit
  dialog pre-filled with the client + date/time; that creates a normal app visit while
  the external event remains untouched (no import, just a head start).

**Credential mechanics (backend-owned):** Google Cloud project + Calendar API;
`calendar.events` scope only (covers both directions on primary); OAuth Web client with
backend callback (`/integrations/google/connect` → callback → **refresh token encrypted
in Neon**, per user); client secret via `wrangler secret` + `.dev.vars`; plain REST
`fetch` (no googleapis SDK on Workers); 401/revocation → mark disconnected, surface a
reconnect chip. **Known costs accepted:** sensitive-scope verification (weeks — park the
project in review early; unverified = 100 test users + 7-day refresh tokens) and a
**single-brand consent screen across all whitelabel tenants**.

**UI:** a per-user "Conectar Google Calendar" action in the calendar page header
(status chip: connected as `x@gmail.com` / reconnect / disconnect) — self-service, all
roles. External chips show full title to their **owner**; other users see "Ocupado
(Google)" by default (privacy — open decision below).

---

## Checkpoints

**Sequencing (decided 2026-07-31, owner): three PRs, one per module** — backend first,
then the two consumers independently. The calendar must not wait on the field app.

### CP-1 — Backend: visit entity + lifecycle — [x] built (PR #110)
- [x] `scheduled_visits` + `visit_equipment`, order-bound with the audit routed to the
      order timeline (no visit-level event table)
- [x] List (bounded range) / detail / create / correct / assign / respond / close /
      reschedule + role guards

### CP-1b — Backend: duration + actuals (amends PR #110) — **PR 1 of 3** — [x] built
- [x] **Columns:** `expected_duration_minutes` (NOT NULL, default 60), `actual_start`,
      `actual_end`, `actual_duration_minutes`; `scheduled_end` **kept** as the fast
      reference and written together with the expected duration.
      ~~DDL applied directly to the shared Neon DB, the way the visits table itself
      shipped~~ — **superseded 2026-08-01 (owner)**: that rule is revoked. Everything
      ships as `0031_visits_duration_actuals.sql`, which also **backfills CP-1**: the
      shared database never actually received the CP-1 DDL and still carried the
      pre-pivot table, so the migration reconciles it additively (nine missing columns,
      `visit_equipment` created, `status_reason` + the orphan `visit_assignments` left
      alone — no destructive statements in a file every tenant runs)
- [x] **`internal_code`** (`V-YYYYMMDD-NNNN`, owner 2026-08-02) — backend-minted from a
      `visit_counters` daily sequence inside the create transaction, NOT NULL, unique on
      live rows. Searched by **equality or prefix** against a btree, never `%fragment%`
      (which would have meant `pg_trgm` in every tenant DB); `GET /visits` accepts
      `internalCode` **instead of** a date range, so a code finds its visit without the
      caller knowing which week it is in
- [x] **`VisitStatus.InProgress`** + `POST /:id/start` (Iniciar, client-supplied
      `actualStart`); `/respond` extended with `actualEnd` → stamps
      `actual_duration_minutes`
- [x] **Guards:** correction 409s once `in_progress`; **reassignment stays open** on
      `in_progress` (audited); close still reachable from `in_progress`
- [x] **`PATCH /:id/actuals`** — owner/admin, terminal visits, recomputes the duration
- [x] **Timeline:** `visit_started` + `visit_actuals_corrected` in `VisitEventType` and
      the matching `ServiceOrderEventType` members (the `Record<>` map in
      `visit-audit.service.ts` makes an unmapped member a compile error)
- [x] **`test/visits.test.ts`** — the module had none, which broke `backend/CLAUDE.md`'s
      one-suite-per-resource rule. Full lifecycle + the new actuals, fixture rows
      soft-deleted in `afterAll`. **33/33 green** against the shared DB, but only after
      it found the defect below — the suite earned its keep on its first run
- [x] **`0032_visits_drop_stale_status_check.sql`** — the shared table still carried
      PR #97's `CHECK (status = ANY (ARRAY['scheduled','completed','cancelled','missed',
      'rescheduled']))`, the **pre-pivot vocabulary**. `in_progress` and `closed` are not
      in it, so every Iniciar and every Cerrar came back `23514 → 500` (14 tests). Dropped
      rather than corrected: the drizzle model declares no check, so a tenant provisioned
      from the migrations never had one, and correcting the array would have left the
      shared DB enforcing a contract no other tenant has — the exact divergence the
      never-hand-apply rule exists to prevent. Every migration-era table
      (`service_orders`, `quotations`, `service_order_events`, `services`, `equipment`)
      carries zero check constraints; only the legacy tables still do
  - **Note the limit this exposes in transactional dry-runs:** `0031` was verified by
        executing all 32 statements inside `BEGIN … ROLLBACK`, and that proved the DDL
        *runs* while saying nothing about what rows the table would then **accept**. Only
        the suite could catch this. Dry-run the DDL, then exercise the endpoints
  - **Open, wider than 12:** the same orphan-constraint problem sits on `customers`,
        `reports`, `users`, `notifications`, `cms_documents`, `report_templates` and
        `brand` — live CHECKs in **no** drizzle model, so a fresh tenant gets none of
        them. `customers_source_check` and `notifications_type_check` enumerate values
        that will drift and will fail exactly this way. Wants its own branch
- [x] **Snapshot-chain repair.** `meta/` had no snapshots for `0028`–`0030`, so
      `db:generate` proposed re-creating tables that exist and emitted three unguarded
      `ADD COLUMN`s that would have failed. `0031`'s snapshot is regenerated from the
      real models, and `db:generate` now reports no pending changes

### CP-2 — Superadmin: time-axis calendar — **PR 2 of 3** — [x] built (PR #128)
- [x] DTOs + `VisitsState` + http service + pipes/constants (`model/enums/visit/`,
      `model/constants/visit/`). The data layer written for CP-1 knew nothing of
      CP-1b — no `internalCode`, no duration, no actuals, no `in_progress` — so this
      was a catch-up, not an addition: `scheduledEnd` left every request shape (it is
      derived server-side), `PATCH /:id/actuals` and its action arrived
- [x] **24h scrollable time grid** opening at 00:00; blocks positioned/sized by time;
      overlap splits the day column; **planned ghost + actual solid** overlay.
      Geometry is a pure module (`data/calendar-layout.ts`) rather than page code —
      greedy lane packing per *overlap cluster*, so one busy morning doesn't narrow an
      empty afternoon, and the packing spans planned ∪ actual because a job that ran
      long competes for the same width
  - **The open-ended block.** A block whose length is a projection rather than a
        record is drawn with its bottom edge faded. Keyed on the missing
        `actualDurationMinutes`, **not** on `in_progress`: office completing a visit
        from the admin stamps no `actualEnd` either, and a closed rectangle there would
        report a finish time nobody recorded
- [x] Visit dialog (create with locked-order support, duration field, correction,
      reassignment, Responder) + close dialog (categorized + reschedule now/later) +
      reschedule dialog + **correct-actuals dialog** (owner/admin). The dialog's surface
      now narrows with the lifecycle — full correction while `scheduled`, **reassignment
      only** while `in_progress`, read-only once terminal apart from the admin-tier
      actuals fix — which is the immutable-record model made visible
- [x] Order view "Programar visita" (order pre-locked); week + tech filter in the URL
- [x] Route + **Calendar** sidebar entry; mobile day-agenda collapse.
      **Calendario returned to the staff nav**, superseding the 2026-07-22 owner
      regroup that dropped it: it had no page worth linking to then
- [x] **`internalCode` search** (beyond the list above — added because CP-1b built the
      prefix filter for exactly this, and nothing else consumes it). `?code=` swaps the
      grid for a result list, since a code match can land in any week; the term is
      checked against the code alphabet client-side so a `%` never becomes a failed
      round trip
- [ ] Manual pass: schedule → reassign → start → terminar → block shows ghost + actual;
      close → reschedule → linked successor; every action on the order timeline (19 §7).
      Build is green

### CP-3 — Field app: technician visits + offline — **PR 3 of 3** — [x] built (PR #129)
- [x] `visits/` module in `frontend/`: "Mis visitas" list (hoy / mañana / esta semana +
      lazy-loaded siguiente semana) + visit detail with the keyless Maps embed,
      phone-first
- [x] **Iniciar / Terminar** actions; Cerrar with categorized reason
- [x] **Offline queue at Dexie v2**: `pendingVisitActions` store + sync pass in
      `offline-sync.service`, local tap timestamp preserved through the sync; the
      `VisitVM` overlay reads un-synced taps as applied state with a "Sin
      sincronizar" chip
- [ ] Manual pass: airplane mode → Iniciar → Terminar → reconnect → both land with the
      *field* times, not the sync times

### CP-4 — Live calendar: visit lifecycle events over SSE — [x] built (PR #132)

The field app writes what happens — Iniciar / Terminar / Cerrar sync in — but the
calendar only reads its window when something makes it, so office watches a static
grid while the day actually moves. PR #130 patched the sharpest edge (the visit
dialog re-reads its target on open); CP-4 removes the class of bug: the calendar
catches visit lifecycle events live.

Everything rides existing rails — no new infrastructure:

- **Transport: SSE, the notifications pattern verbatim** (notifications §2.2:
  `streamSSE` + per-connection DB poll + comment heartbeat — Workers isolates share
  no memory across the fleet, the row is the truth). New endpoint
  `GET /visits/stream`, staff-gated (`owner/admin/office` — the field app stays
  offline-first pull, techs don't subscribe in v1). Own
  `visits/constants/stream-timing.ts` mirroring the notifications cadence
  (2 s poll / 15 s heartbeat) so the two streams stay independently tunable.
- **Source: the order timeline, not the visits table.** Every lifecycle action
  already appends a typed `service_order_events` row — `visit_created`,
  `visit_started`, `visit_completed`, `visit_closed`, `visit_rescheduled`,
  `visit_reassigned`, `visit_corrected`, `visit_actuals_corrected` — an append-only
  log with a natural `created_at` cursor, so nothing new has to remember to emit.
  The poll reads events after the cursor filtered to the visit set, batch-reads the
  distinct touched visits, and emits one frame per event: `event: visit`, data
  `{ kind, visit }`, where `visit` is the same flattened DTO the single-visit GET
  returns — the client merges without a second read. Inherited caveat: a write
  that bypasses the service layer (manual SQL) appends no event and streams
  nothing — accepted, that is not a product path.
- **Cursor starts at connect time — no replay.** The subscriber refetches its
  window on every (re)connect (the bell's posture: the one-shot read re-syncs,
  the stream keeps it warm), so missed frames cost one window read, never a gap.
- **Client: NGXS merge, no refetch storm.** The calendar page subscribes while
  mounted through the shared `sseStream` reader (`services/sse.ts`); each frame
  dispatches a `VisitEventReceived` action and `VisitsState` upserts by id into
  the loaded window (frames outside the window drop). The open visit dialog
  re-narrows when a frame matches its target; the on-open re-read (#130) stays as
  catch-up for the subscription gap.

- [x] Backend: `GET /visits/stream` + stream service (cursor poll over
      `service_order_events` filtered to the visit event types, batch visit read,
      heartbeat) + timing constants + index on `service_order_events(created_at)`
      — shipped **plain, not partial** (build call, #132): a partial predicate
      would have to mirror the stream's type list, and a type added to one but
      not the other would silently stop using the index. The cursor rides the
      DB's `::text` timestamp with id-dedupe — a JS `Date` truncates Postgres
      microseconds and re-delivers the newest event forever (the notifications
      stream carries the same latent bug, masked by its by-id upsert — open
      follow-up)
- [x] Superadmin: calendar-page subscription (connect on enter, abort on leave) +
      `VisitEventReceived` upsert in `VisitsState` + dialog re-narrow on matching
      frame + reconnect backoff that re-reads the window
- [ ] Manual pass: two browsers (office calendar + field-app tech) — Iniciar,
      Terminar and Cerrar each move the block and any open dialog within a poll
      tick, no reload; kill the network mid-stream → reconnect re-syncs the
      window. **Browser-verified 2026-08-07** (create appears live; open dialog
      flips Programada → En curso on Iniciar); the network-kill re-sync is what
      remains
- Later consumers, out of v1: order-view visits card reads the same stream (the
  dashboard card landed with CP-4b)

### CP-4b — Polish — [x] built (2026-08-07)
- [x] Status colors incl. `in_progress` (amber = live), closed muted/strike — already
      shipped with CP-2's `VISIT_BLOCK_CLASSES`; **reschedule-chain link** landed
      here: both hops navigable in the visit dialog (predecessor "verla" /
      successor "ver la visita nueva"), each a single-visit read that swaps the
      dialog's target instead of stacking dialogs. Dark-mode ghost/solid audited
- [x] Dashboard "today's visits" card — first card into the 02 §4 slot grid
      (`calendar/components/today-visits-card/`); rides the SAME LoadVisits +
      ListenVisits machinery as the calendar page, so it is live off the CP-4
      stream with zero new plumbing (safe: dashboard and calendar are separate
      routes, never mounted together)
- [x] Estimate-accuracy read (planned vs actual, 30 days) — the card's footer:
      average signed variance across measured completed visits, read directly
      from the API (routing it through `VisitsState` would clobber the today
      window the same card renders)
- ~~Empty states ("nothing scheduled this week")~~ — superseded by CP-2's
      deliberate no-period-empty-state call (empty columns say it better; the
      phone agenda keeps its per-day message). The dashboard card carries its
      own "Sin visitas programadas para hoy"

### CP-5 — Google Calendar (§7; blocked on backend integration endpoints + Google
### verification)
- [ ] Connect/disconnect UI + status chip (connected account, reconnect on revocation)
- [ ] External-event overlay chips in week grid (muted/striped, owner sees title,
      others "Ocupado (Google)")
- [ ] Client tag on matched chips (link to customer view) + "Crear visita" pre-filled
      quick action (staff only)
- [ ] Manual pass: connect → create visit → appears in Google; create event in Google →
      shows as overlay; invite a known client email → chip shows client tag → "Crear
      visita" pre-fills; edit pushed event in Google → app visit unchanged, next push
      overwrites; disconnect → overlay gone

## Open decisions / asks
- **Mid-job handoff attribution (raised 2026-07-31).** Reassignment stays open while
  `in_progress`, but a visit carries exactly **one** `technicianId` — so if Ana starts
  at 09:15 and Beto is handed the job and finishes it, the record credits *Beto* with
  Ana's `actualStart`. The timeline has the truth (`visit_reassigned`, from → to, with
  its timestamp); the visit row does not. Harmless until performance reporting or
  time-based billing actually reads these numbers, at which point the choice is: split
  the visit at handoff, add a per-technician time-segment child table, or accept
  last-assignee-takes-all. **Decide when the reporting is built, not before.**
- **Offline conflict rule (raised 2026-07-31, needed for CP-3).** The queue can deliver
  visit actions out of order or twice: two Iniciar taps on one visit, or a Terminar
  that reaches the server before the Iniciar it followed. Candidate rule — **first
  Iniciar wins, later ones are no-ops; a Terminar arriving without an `actualStart`
  is accepted and backfills the start from its own queued Iniciar when that lands.**
  Confirm before building the sync pass.
- **Does the superadmin keep a technician mode now that the field app has one?
  (raised 2026-07-31.)** §3's "My visits pre-filter + read-only team toggle" and the
  `swap-visit-dialog` (§2a) were designed when the admin was a technician's only
  surface. With CP-3 giving techs a real field-app module, the swap may belong there
  instead — or in both. Unassigned pending a call; the swap dialog is currently
  **in no checkpoint**.
- ~~Free-standing visits~~ — **superseded 2026-07-23:** visits are strictly
  order-bound (`serviceOrderId` NOT NULL, 19 §1). Non-job appointments (sales,
  courtesy calls) live as CRM `visit` interactions (08); a diagnostic visit is a
  small order. Calendar UI ships as 19 CP-3.
- ~~Do benign date moves also go through reschedule?~~ · ~~mutable-edit + reopen model~~
  — **superseded 2026-07-23 (immutable-record pivot):** a visit is immutable once
  created. While `scheduled`, office may **correct** it in place (date/title/notes) via
  a narrow `PATCH` and **reassign** the tech — the only mutations. A tech then
  **responds** (→ completed) or **closes** with a categorized reason; both are terminal
  (no reopen). "Moving" a could-not-serve visit = close + **reschedule** (a new linked
  record), prompted now/later. **All of it audits to the parent order's timeline (19
  §7), not to the visit** — that consolidated history is the client handoff at service
  end. Supersedes the visit-level `visit_events` table (PR #97).
- ~~Close reason: single vs distinct statuses~~ — **decided 2026-07-23:** a single
  `closed` status + a required **category** (`client_cancelled | client_absent |
  no_access | tech_unavailable | other`) + optional note.
- FullCalendar (drag-and-drop) vs staying custom — revisit only on real demand; verify
  Angular 21 + zoneless compat before adopting.
- Tech swaps without approval (§2a): add an office-approval step if abused.
- Overdue open visits (past `scheduledStart`, still `scheduled`) — surface as an
  "atrasada" chip and prompt the tech to respond/close; no auto-status sweep (the tech
  must close with a reason). Backend nudge/cron later if needed.
- Close-reason categories: confirm the v1 list with the first tenant; `other` + note is
  the escape hatch.
- Report→visit closing hook: when a report is created for a client with a same-day
  scheduled visit, backend links + completes it — confirm heuristic with backend
  (explicit visit pick in the field app is the clean upstream fix; record as upstream ask).
- Ask to 07: "upcoming visits" mini-card slot on customer-view.
- Ask to 05: technician color assignment (per-user color for chips) — nice-to-have,
  can be hash-derived from user id in v1.
- Does calendar ride a new `scheduling` tenant-config flag (with 13) or ship core?
  Tentative: **`scheduling` flag** — confirm with the manager push schema (14 open item).
- ~~ICS feed / no integration~~ — **superseded 2026-07-05: Google OAuth is in** (§7):
  one-way push + read-only external overlay, so dates created outside the admin stay
  visible. Two-way write-back remains rejected.
- External-event privacy: default is title-for-owner, "Ocupado (Google)" for everyone
  else — should owner/admin see titles too? Decide with the first real tenant. (The
  client tag from email matching is shown to all staff regardless — §7.)
- ~~Domain-level matching~~ — **rejected 2026-07-05:** exact-match only, permanently.
  Multiple distinct client records can share an email domain (branches/locations of the
  same organization served separately), so "anyone @hotelx.com" would mis-link across
  branches. Per-branch precision comes from registering each branch's specific contact
  emails on its own client record (`contacts[]`).
- Should a matched external event optionally log to the client's CRM timeline (08)?
  Leaning no (it would persist what is otherwise display-only) — revisit on demand.
- Primary calendar only in v1 — secondary-calendar selection later if asked.
- Overlay freshness: on-demand fetch per range load + short server cache (assumed
  minutes); webhook push channels stay out.
- **Start the Google Cloud project + sensitive-scope verification early** — it's the
  long pole (weeks) and CP-5 is blocked on it; consent screen will show one brand for
  all tenants (accepted §7).
