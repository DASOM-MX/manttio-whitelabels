# 12 — Calendar (scheduled visits)

> **Status:** in-progress (backend entity on `feature/fullstack-calendar-module`) · **Depends on:** 02 (CP-3), 05 (tech roster), 07 (CP-1), 18 (visits are order-bound)
> **Owner:** — · **Last updated:** 2026-07-23

Team scheduling: who goes where, when. Owns the **`ScheduledVisit`** entity (order-bound,
18 §1) and the calendar views. **Immutable-record model (decided 2026-07-23):** office
schedules and — while a visit is still open — corrects/reassigns it; the assigned
technician then **responds** (serves) or **closes** it with a categorized reason and is
prompted to **reschedule** (a new linked record) now or later. Nothing is edited after a
tech acts, and **every action audits to the parent service order's timeline (18 §7)** —
never to the visit — so the whole job history hands off to the client at service end.

A visit is a *plan*; a report (06) is what *happened*. They link (`reportId` set on
completion) but neither replaces the other.

---

## 1. Data model (DTO view)

```
ScheduledVisit {                // IMMUTABLE record (decided 2026-07-23) — see below
  id, customerId,
  serviceOrderId,               // REQUIRED (2026-07-23, 18 §1) — every visit belongs
                                //   to exactly one service order; the client derives
                                //   from the order
  // contract link lives on the parent order, not here (2026-07-23): orders MAY
  // generate a contract (18 §1); a visit's contract is derived via its order
  equipmentIds?: string[],      // units to service (11), optional
  technicianId?,                // null = unassigned (backlog lane) — mutable while
                                //   `scheduled` (reassignment); audited at order level
  scheduledStart,               // datetime
  scheduledEnd?,                // optional — many SMB visits are "morning-ish"
  status: 'scheduled' | 'completed' | 'closed',   // terminal once completed/closed
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
- **Respond or close (decided 2026-07-23).** The assigned technician either **responds**
  — serves it → `completed`, producing/linking the report — or **closes** it with a
  **categorized reason** (`client_cancelled | client_absent | no_access |
  tech_unavailable | other`) + optional note. There is no in-place cancel/miss edit and
  no reopen; a closed visit is done.
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
  visit) — is appended to the parent order's **activity timeline** (18 §7), alongside
  order and report events, so the whole history can be **handed to the client at the end
  of the service**. (Supersedes the visit-level `visit_events` table on the
  `feature/fullstack-calendar-module` branch / PR #97 — folded into the order timeline
  when 18 lands.)
- `completed` is set when the tech responds/serves (report linked); staff may also set
  it manually.

## 2. Roles (extends `14-access-control.md` §2)

| Action | owner | admin | office | technician |
|---|---|---|---|---|
| See the full team calendar | ✓ | ✓ | ✓ | ✓ (read-only) |
| Create visits | ✓ | ✓ | ✓ | — |
| Correct an **open** visit (date/title/notes) | ✓ | ✓ | ✓ | — |
| Reassign an **open** visit | ✓ | ✓ | ✓ | — |
| **Swap own** open visit to another tech | — | — | — | ✓ᵃ |
| **Respond** (serve → completed) | ✓ | ✓ | ✓ | ✓ (own) |
| **Close** with categorized reason | ✓ | ✓ | ✓ | ✓ (own) |
| **Reschedule** a closed visit (new record) | ✓ | ✓ | ✓ | ✓ (own) |

a. **Tech swap:** a technician can hand off an *open* visit currently assigned to *them*
   to another technician (mutual coverage — "take my Tuesday"). It goes through the same
   reassignment endpoint, is audited identically (at the order level), and requires no
   approval in v1 (open decision below if that proves too loose). Techs cannot pull
   visits *from* colleagues — only give away their own. Once a visit is
   completed/closed it is immutable, so swaps only apply while `scheduled`.

## 3. Calendar UI (decided direction)

**No FullCalendar in v1.** Start with a custom Tailwind-built **week grid + day agenda**:

- `calendar/pages/calendar/` — week view: one column per day; visit chips (time, client,
  tech color-dot) stacked per day; a technician `<p-multiselect>` filter + "unassigned"
  toggle; month `<p-datepicker>` jump; prev/today/next. Mobile collapses to a single-day
  agenda list.
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
  select (with "unassigned"), date + optional time range, title, notes. Edit mode adds
  the tech action buttons — **Responder** (serve → completed) and **Cerrar** (close with
  a categorized reason) — plus, on an *open* visit, office correction (date/title/notes)
  and reassignment. Once completed/closed the dialog is read-only. The full history is
  **not** shown here — it lives on the parent order's activity timeline (18 §7).
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

## 5. Expected API surface

- `GET /visits?from&to&technicianId&customerId&status` → list for the visible range
  (calendar loads by week; no pagination, range-bounded)
- `GET /visits/:id` — the immutable record + its close/reschedule chain (audit trail is
  on the order, not here — 18 §7)
- `POST /visits` — create (staff)
- `PATCH /visits/:id` — **open-visit correction only** (date/title/notes; **not**
  technicianId, **not** if completed/closed) → 409 if terminal; logs a `visit_corrected`
  event to the order timeline
- `POST /visits/:id/assign` `{ technicianId }` — reassignment on an **open** visit; backend
  enforces the tech-swap rule (requester is tech ⇒ current assignee must be requester) →
  logs `visit_reassigned` (`from → to, by whom`) to the order timeline
- `POST /visits/:id/respond` — serve → `completed` (links the report) → logs
  `visit_completed`
- `POST /visits/:id/close` `{ reason, note? }` — categorized close → `closed` → logs
  `visit_closed`
- `POST /visits/:id/reschedule` `{ scheduledStart, scheduledEnd?, technicianId? }` →
  new `scheduled` record from a **closed** visit (`rescheduledFromId` set) → logs
  `visit_rescheduled` (→ new visit); techs may do this for their own visit
- All mutation endpoints append to the **parent order's activity timeline** (18 §7) —
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
  fields)` (open only), `AssignVisit(id, technicianId)`, `RespondVisit(id)`,
  `CloseVisit(id, reason, note?)`, `RescheduleVisit(id, whenFields)`, `LoadGoogleStatus`,
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

### CP-1 — Visit entity + week view
- [ ] DTOs + service + `VisitsState`
- [ ] Week grid page (range loading, day columns, visit chips, tech filter)
- [ ] Route + **Calendar** sidebar entry (owner/admin/office + technician)

### CP-2 — Scheduling flows (immutable-record model)
- [ ] Visit dialog: create (staff) + open-visit correction (date/title/notes) + read-only
      once terminal
- [ ] Reassignment via `/assign` (open only) + toasts
- [ ] Respond (`/respond`) + Close dialog (`/close`, categorized reason) + reschedule
      now/later prompt → reschedule dialog (`/reschedule`, new linked record)
- [ ] Mobile day-agenda collapse

### CP-3 — Technician mode + swap
- [ ] "My visits" pre-filter + read-only team toggle (route `data` per 10 §4)
- [ ] Tech actions on own visits: respond / close / reschedule; swap dialog (open own
      visits only)
- [ ] Manual pass as tech: see own week → close one with a reason → reschedule → new
      record appears; swap an open visit → colleague sees it

### CP-4 — Polish
- [ ] Status colors + closed muted/strike style + reschedule-chain link; dark-mode audit
- [ ] Dashboard "today's visits" card
- [ ] Empty states ("nothing scheduled this week"); build green; manual pass: schedule →
      reassign → respond → shows green; close → reschedule → linked successor; unassigned
      lane filters correctly; every action lands on the order timeline (18 §7)

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
- ~~Free-standing visits~~ — **superseded 2026-07-23:** visits are strictly
  order-bound (`serviceOrderId` NOT NULL, 18 §1). Non-job appointments (sales,
  courtesy calls) live as CRM `visit` interactions (08); a diagnostic visit is a
  small order. Calendar UI ships as 18 CP-3.
- ~~Do benign date moves also go through reschedule?~~ · ~~mutable-edit + reopen model~~
  — **superseded 2026-07-23 (immutable-record pivot):** a visit is immutable once
  created. While `scheduled`, office may **correct** it in place (date/title/notes) via
  a narrow `PATCH` and **reassign** the tech — the only mutations. A tech then
  **responds** (→ completed) or **closes** with a categorized reason; both are terminal
  (no reopen). "Moving" a could-not-serve visit = close + **reschedule** (a new linked
  record), prompted now/later. **All of it audits to the parent order's timeline (18
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
