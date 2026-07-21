# Notifications module — plan

> **Status:** not-started (plan) · **Owner:** — · **Last updated:** 2026-07-20
> **Kind:** shared full-stack infrastructure (backend module + thin superadmin surface) — **not** a numbered superadmin module; a foundational initiative built **before** its first consumer.
> **Depends on:** `modules/email` (Resend transport), `modules/brand` (`getBrand` — de-branding), `users` (recipient FK). Introduces the codebase's **first** SSE endpoint and **first** Worker cron.
> **First consumer:** WMS replenishment approval/failure/rejection notices (`10-wms/` — §4 below). Built beforehand so WMS calls `notify()` instead of wiring email/banner by hand.

A small, generic **notification delivery + persistence** layer. A backend module lets any
domain create a per-user notification; each notification is **persisted with a status**,
**pushed live over SSE** (consistent with the WMS import-status stream), and optionally
**emailed** (de-branded, best-effort). A thin superadmin surface (a topbar bell + panel)
shows the logged-in user their notifications. A daily cron **clears records older than 8
months**. Nothing here is WMS-specific — replenishment is just the first caller, the same
way `wms.last_replenishment_mapping` was the `settings` table's first key.

The design goal is **"something simple"**: callers decide *who / what / which channels*;
the module owns *persist → fan out → live-push → retain*. No routing rules, no templating
engine, no preference center in v1.

---

## 0. Scope & decisions (2026-07-20)

- **Email channel deferred (owner, 2026-07-20 — supersedes "two channels, v1" below).**
  v1 ships **`in_app` only**: the persisted row + SSE push. No email compose/dispatch,
  no `channels` input on `notify()`, no `email_status`/`email_error` columns, no
  `NotificationChannel`/`EmailDeliveryStatus` enums yet. Email gets wired from its own
  `notification-email.service.ts` once the needed HTML templates exist; the columns land
  as additive DDL with that change. §2.1 step 2, §2.3, and the email tests in §5 are
  deferred with it (the §4 WMS contract keeps `channels` as the *future* shape).
- ~~**Two channels, v1:**~~ *(superseded above)* `in_app` (the persisted row + SSE push —
  always on) and `email` (opt-in per call, de-branded, best-effort). SMS/WhatsApp/push
  are later channels behind the same `notify()` seam.
- **Addressed by user *or* role.** A notification targets a specific `users.id`, **or** a
  **role** (the baseline `owner`/`admin`/`office`/`technician`) used as a fallback when no
  `recipientUserId` is given. A role send **fans out at creation** — `notify()` resolves the
  active users of that role and inserts **one row per user** (each with a concrete
  `recipient_user_id`), so read-state, the badge, SSE scoping, mark-read, and retention all
  stay per-user and unchanged; each recipient dismisses their own copy independently. (The
  alternative — one shared role-addressed row + a per-user read-state join table — was
  rejected: it breaks the clean per-user read model for no real gain at this scale.) Users
  have a single role here, so a broadcast is a handful of rows. Backend is per-tenant
  deployed, so there is **no `tenant_id`** column (matches `users`/`customers`).
- **The module doesn't own recipient *policy*.** Callers pass a `recipientUserId` **or** a
  `role`; the module resolves a role to its active users but never decides *who should
  care*. WMS resolves the direct recipient from `getSetting('notifications.manager_user_id')`
  (that key + the `settings` module stay a WMS/ops concern — `10-wms/01-data-model.md` §2)
  and now **falls back to a role broadcast** (`owner`/`admin`) when the key is unset (§4) —
  the email/bell equivalent of the banner's owner/admin fallback — instead of skipping.
- **SSE for consistency (owner).** Live delivery reuses the WMS SSE shape
  (`text/event-stream` via Hono `streamSSE`, Bearer-authed, `~2 s` DB re-read + `15 s`
  heartbeat) — **but the notifications stream is session-length, not self-closing** (WMS's
  import stream closes on the terminal event; a user's notification feed has no terminal).
  The frontend reuses the same **fetch-based SSE reader** (not `EventSource` — can't set
  `Authorization`). This is the **second SSE consumer**, which per `10-wms/07` §3.1 is the
  trigger to **extract the reader into a shared util** (§3.1).
- **Retention = a sanctioned hard delete (owner-directed).** The fork rule (`CLAUDE.md`,
  2026-07-19) makes soft delete the *only* removal mechanism **for every domain entity** —
  no hard-DELETE, no wipe scripts, no destructive migrations. That rule exists to protect
  **strong entities with dependents** (a deleted customer must not orphan its reports' FKs).
  A notification is the opposite: a **leaf / weak entity** — **nothing FKs to it**, no
  dependents to cascade or orphan (owner, 2026-07-20: "not strong entities with dependent
  entities"). It is a **transient delivery copy**, not an audit trail and not a user-facing
  resource — the permanent record of the underlying event lives in the originating module's
  own append-only log (e.g. WMS `replenishment_import_events`). So removing an old
  notification breaks **no referential integrity**, and the daily 8-month purge is a plain
  **hard `DELETE`** (a soft flag would never bound table growth, which is the whole point of
  "clear records older than 8 months") — the same sanctioned exception class as the WMS
  staging retention sweep (`10-wms/11` §4), touching **no audit trail**. The one deliberate,
  owner-directed departure from the no-hard-deletes default; called out so it reads as
  intentional, not drift.
- **Creation is server-internal only.** No client-facing "create notification" endpoint —
  domain modules call the service in-process. Clients only *read*, *mark read*, and
  *stream*.

---

## 1. Data model

One additive table. String-valued TS enums (`notifications/enums/`), columns typed via
`.$type<Enum>()`, narrowed by a `CHECK`, validated with `z.nativeEnum(...)` — the house
convention (`customers/enums/customers.enum.ts`).

### `notifications`  (`notifications/models/notifications.model.ts`)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk `defaultRandom()` | |
| `recipient_user_id` | `uuid` not null | → `users.id` (FK; relation in the `database/schema.ts` barrel, not the model file). **Always concrete** — role sends fan out to one row per user (§2.1) |
| `audience_role` | `text` `.$type<Role>()` nullable | provenance: the role broadcast that produced this row; `null` when addressed directly by `recipientUserId`. **Non-functional** — grouping/debugging + an optional "para administradores" tag (§3.3) |
| `type` | `text` `.$type<NotificationType>()` not null | drives the frontend icon/label/deep-link; `CHECK` in the enum's value set |
| `title` | `text` not null | short, already-localized (Spanish) — the module does no i18n |
| `body` | `text` not null | one/two lines |
| `data` | `jsonb` not null default `{}` | deep-link payload — e.g. `{ importId, warehouseId, counts, link }`; the frontend builds the router target from this + `type` |
| `status` | `text` `.$type<NotificationStatus>()` not null default `'unread'` | `unread` \| `read` — the in-app lifecycle ("hold statuses") |
| `read_at` | `timestamptz` nullable | stamped on first `read` |
| `email_status` | `text` `.$type<EmailDeliveryStatus>()` nullable | `null` = email not requested; else `skipped` \| `sent` \| `failed` (the email channel's outcome) |
| `email_error` | `text` nullable | short reason when `email_status='failed'` (best-effort diagnostics; never surfaced to users) |
| `created_at` | `timestamptz` not null `defaultNow()` | retention key + default sort |

Indexes: `(recipient_user_id, created_at DESC)` (list + stream cursor), a **partial**
`(recipient_user_id) WHERE status='unread'` for the badge count, and `(created_at)` for the
retention sweep.

> `in_app` needs no delivery column — **the row *is* the in-app delivery**. Only `email`
> carries a separate outcome, hence `email_status`/`email_error` and no per-channel table.

### Enums (`notifications/enums/notifications.enum.ts`)

```ts
export enum NotificationType {
  ReplenishmentReady    = 'replenishment_ready',     // WMS: awaiting approval (from processing OR resubmit)
  ReplenishmentFailed   = 'replenishment_failed',    // WMS: import failed / DLQ
  ReplenishmentRejected = 'replenishment_rejected',  // WMS: owner/admin sent it back to office
}
export enum NotificationStatus { Unread = 'unread', Read = 'read' }
export enum EmailDeliveryStatus { Skipped = 'skipped', Sent = 'sent', Failed = 'failed' }
```

`NotificationType` is **open by design** — new callers append members (a calendar
visit-reminder, a contract-expiry warning) without touching this module's logic; only the
frontend label/icon maps grow (§3.3). `NotificationChannel` (`in_app` \| `email`) is an
input enum on `notify()`, not a column. **Role addressing reuses the existing users-module
role enum** (`owner`/`admin`/`office`/`technician`) — not redefined here; `audience_role` is
typed against it.

### Migration

Additive — one `CREATE TABLE` + indexes. Per the shared-DB rule
(`10-wms/01-data-model.md` §1): `pnpm db:generate` for the record, then **apply the
additive DDL directly** to the live Neon DB rather than blind-running `db:migrate`. Add the
FK relation to the `database/schema.ts` barrel; re-export the table there.

---

## 2. Backend module — `backend/src/modules/notifications/`

Mirrors the `customers/`/`cms/` taxonomy:

```
notifications/
  controllers/  notifications.controller.ts     (thin Hono router: auth → service → respond)
  services/     notifications.service.ts         (notify() + reads + mark-read)
                notification-email.service.ts    (de-branded compose → modules/email sendEmail)
                notifications-retention.service.ts (the sweep body, called by scheduled())
  repository/   notifications.repository.ts      (every Drizzle query)
  models/       notifications.model.ts
  validators/   notifications.validator.ts       (zod: list query, mark-read param)
  enums/        notifications.enum.ts
  types/        notifications.types.ts           (NotifyInput, NotificationView)
  http-errors/  notification-not-found.error.ts
```

### 2.1 The service — `notify()` (the one entry point callers use)

```ts
notify(db, env, {
  recipientUserId?: string,           // direct addressing — takes precedence
  role?: Role | Role[],               // role broadcast — used when recipientUserId is absent
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channels?: NotificationChannel[],   // default ['in_app']
}): Promise<Notification[]>           // one per resolved recipient (a 1-element array for a direct send)
```

0. **Resolve recipients.** `recipientUserId` present → `[that user]` (any `role` is ignored,
   per "if no recipientUserId is set"). Else `role` present → all **active**
   (non-soft-deleted) users holding any of those role(s), deduped; each row's
   `audience_role` = that user's role. **Neither** given → programmer error (throw — never a
   client-triggered path). **Empty resolution** (a role with no active users) → no rows,
   log-and-skip (best-effort, same class as an unconfigured recipient — never an error).
1. **Per resolved recipient**, insert a row (`status='unread'`; `email_status` = `null`
   unless `email` requested).
2. If `channels` includes `email`, **per row**: resolve that recipient's email (`users`),
   compose a **de-branded** message (§2.3) and `sendEmail(...)`. **Best-effort,
   non-blocking** — wrap in try/catch: on success stamp `email_status='sent'`; on a send
   error `'failed'` + `email_error`; on a missing recipient email / neutral config
   `'skipped'`. A failure here **never** throws out of `notify()` and never rolls back the
   in-app row (the persisted row + SSE are the reliable floor — mirrors the WMS "best-effort
   email" rule, `10-wms/11` §2). A role fan-out ⇒ one independent email per recipient.
3. The insert alone makes each live: the SSE stream (§2.2) re-reads that recipient's rows and
   pushes it. No in-process pub/sub needed (Workers isolates don't share memory across the
   fleet) — **the DB row is the truth**, exactly as WMS treats import status.

Callers **never** touch the table or email directly — one seam, one place to add a channel.

### 2.2 Controller / endpoints — `/notifications`

All Bearer-authed (the shared JWT middleware); every endpoint is scoped to
`auth.userId` server-side (a user only ever sees / mutates **their own** rows — no role
gate; enforced in the repository `WHERE recipient_user_id = auth.userId`, so a foreign id
yields `404 notification_not_found`, never another user's data).

| Endpoint | Notes |
|---|---|
| `GET /notifications` | Paged (`page`/`limit`, default 25, max 100) `{ items, total, unreadCount }`, newest first; `?status=unread` filter. The one-shot read the bell opens with and the SSE reconnect re-syncs from. |
| `GET /notifications/stream` | **SSE** (`text/event-stream`, `streamSSE`). Session-length: on connect, emits current `unread-count`; then every `~2 s` re-reads rows created after the connection's start cursor and emits a `notification` event per new row (full object, so the bell prepends without a refetch) + an `unread-count` event when the count changes; `15 s` heartbeat comment; **stays open until the client disconnects** (no terminal close). |
| `POST /notifications/:id/read` | Mark one read (own only → `404` otherwise); idempotent; stamps `read_at`. |
| `POST /notifications/read-all` | Mark all the user's `unread` → `read`. |

No `POST /notifications` (create is internal, §0). No delete endpoint (retention is the
only remover — §2.4).

### 2.3 Email compose — `notification-email.service.ts` (de-branding)

Replicates `reports/services/report-email.service.ts` exactly — the module holds **no**
brand literals (fork de-branding rule):

- `getBrand(db, env.LOGOS_CDN_BASE_URL)` (same fn behind `GET /brand`; returns the neutral
  default row when unset).
- `const brandName = brand.name || undefined;` (normalize the blank neutral identity to
  absent so sender/subject hide it).
- `from = brandName ? "\"${brandName}\" <${env.RESEND_FROM}>" : env.RESEND_FROM;`
  (`RESEND_FROM` stays per-deploy infra — never a brand literal).
- `replyTo = brand.contact?.email`; logo/colors/`siteUrl` from `brand` into a **generic
  notification HTML template** (`notifications/templates/` + a `helpers/` renderer, per the
  templates=markup / helpers=renderers split). Subject built from the notification `title`
  + brandName. `sendEmail({ apiKey: env.RESEND_API_KEY, from, to, replyTo, subject, html,
  text })`.

One neutral, reusable email shell for all types (heading = `title`, paragraph = `body`, a
primary button to `data.link`). No per-type email templates in v1.

### 2.4 Retention cron — the codebase's first `scheduled()` handler

- **Daily** `triggers.crons` (e.g. `"0 4 * * *"`) in `backend/wrangler.toml`.
- `index.ts` switches from `export default app` to
  `export default { fetch: app.fetch, scheduled }` — `scheduled()` dispatches by cron/DO
  time to `notifications-retention.service.ts`, which runs
  `DELETE FROM notifications WHERE created_at < now() - interval '8 months'`
  (`RETENTION_MONTHS` env, default 8). Batched delete if counts ever grow; logs the row
  count swept.
- This is the **hard-delete exception** reconciled in §0 — transient records, no audit
  trail touched.
- **Sequencing note:** whichever of {this module, WMS} ships first introduces the
  `scheduled()` handler + the `export default { fetch, scheduled }` change; the second just
  **adds its cron entry + a dispatch branch** to the existing handler (WMS's staging
  retention, `10-wms/11` §4). Since notifications is built *beforehand*, it lands the
  handler; WMS extends it. Note WMS's retention is coupled to Queues (paid plan); a
  pure-notifications cron is **not** — no Queues prerequisite here.

---

## 3. Frontend — superadmin surface

### 3.1 Shared SSE reader (the extraction this module triggers)

`10-wms/07` §3.1 kept the fetch-based SSE reader private to `replenishments.service.ts`
"until a second SSE consumer justifies extracting it." **This is that consumer.** Extract a
small generic helper — `src/app/services/sse.ts`:

```ts
sseStream<T>(url: string, token: string): Observable<T>   // fetch + ReadableStream line
// parser, Bearer header, Accept: text/event-stream; emits parsed `data:` payloads
```

Both `replenishments.service.ts` (WMS) and `notifications.service.ts` consume it. (The
WMS-side repoint is a small refactor **on the WMS branch/PR** when both land — not part of
this doc's PR; noted so it isn't forgotten. No `EventSource`.)

### 3.2 State + service

`NotificationsState` (`src/state/notifications/` — state + actions files, no barrel):

| Slice | |
|---|---|
| `list` | `Notification[]` (newest first) |
| `unreadCount` | `number` (badge) |
| `loading` | |

Actions: `LoadNotifications(query?)`, `ListenNotifications`
(`@Action(..., { cancelUncompleted: true })` — one-shot `GET /notifications` to render
instantly → switch to `sseStream` → `tap` prepends new items / updates count; **no terminal
completion** — a session-length subscription; capped-backoff reconnect `1 s→5 s` that
re-syncs from the one-shot GET, same as WMS), `StopListeningNotifications` (shell teardown
via `DestroyRef`), `MarkRead(id)`, `MarkAllRead`. RxJS pipelines returning the observable
(never `async/await`); reads via top-level `select(...)`, `inject(Store)` only to dispatch.

`notifications.service.ts` (`src/app/services/http/`) wraps `/notifications` + the stream
(via `sseStream`). Query DTOs through `toParams`; error text via `errorMessage`.

### 3.3 Notification center (the bell)

Mounted in the **app-shell** topbar (`02-app-shell`), so it's present on every page and its
stream opens once at shell init:

- A **bell** (outlined `@lucide/angular` `Bell`) with an unread **badge** (PrimeNG
  `Badge`/`OverlayBadge`, hidden at 0). No emojis; superadmin-design "solid & tight" idiom.
- Click → a `p-popover`/overlay **panel**: a dense list of recent notifications — per row a
  **type icon** (lucide, from the type→icon map), `title`, `body`, **relative time**, and
  an unread accent bar. Click a row → `MarkRead(id)` + router-navigate to the deep link
  built from `type` + `data`. Header action **"Marcar todas como leídas"** → `MarkAllRead`.
  Empty state + a "Ver todas" link if a full `/notifications` page is later added (deferred
  — the panel is enough for v1). `animate.enter/leave` for the panel; reduced-motion aware.

Constants (`src/app/model/constants/notifications/` — **one per file**) +
pipes (`src/app/pipes/`, pure — no method calls in templates):

- `notification-type-labels.const.ts` (type → Spanish label) + `-label.pipe.ts`.
- `notification-type-icons.const.ts` (type → lucide icon name) + `-icon.pipe.ts`.
- Reuse a relative-time pipe if one exists; else `relative-time.pipe.ts` (pure).

DTO: `src/app/data/dtos/notifications/notification.dto.ts` — `Notification` with
**string-literal-union** `type`/`status` mirroring the backend enums (kept in sync with §1),
`data`, `createdAt`, `readAt?`, and `audienceRole?` (so the panel can show a subtle "para
administradores"-style tag on role-broadcast rows — optional, cosmetic). Query DTO beside
it. No barrel — import concrete files.

### 3.4 Access

Every authenticated superadmin user has a bell showing **only their own** notifications
(server-enforced, §2.2) — no role gate, no tenant-config flag. When this lands, add a
one-line row to `14-access-control.md` (self-scoped read; internal create) — a follow-up on
the superadmin side, **not** edited here (avoids churn with in-flight superadmin PRs).

---

## 4. First consumer — WMS integration (contract; realized on the WMS side)

Today the WMS suite wires notifications by hand: the queue consumer + `resubmit` endpoint
call `sendEmail` directly, and rejection is in-app-only (`10-wms/02` §6, `10-wms/11` §2,
`10-wms/07` §2/§3). **When this module lands, those become `notify()` calls** — described
here as the contract; the actual WMS-doc/code edits happen **on the WMS branch/PR**, not in
this PR (keeps this PR atomic; cross-refs listed in the PR body):

- **Ready / failed → the manager (or owner/admin as fallback).** Where WMS enters `ready`
  (queue consumer on processed; `resubmit` endpoint on re-request) or `failed`:
  `const mgr = getSetting('notifications.manager_user_id')` then
  `notify({ recipientUserId: mgr, role: mgr ? undefined : [Role.Owner, Role.Admin],
  type: ReplenishmentReady|ReplenishmentFailed, title, body,
  data: { importId, warehouseId, counts, link: '.../approval?import=' },
  channels: ['in_app','email'] })`. The de-branded warning email WMS specified is now the
  module's `email` channel; the bell is the `in_app` channel. **The role fallback carries the
  email + bell to owner/admin when the manager isn't configured** — the backend equivalent of
  the banner's owner/admin fallback (`10-wms/07` §2), so an unset config no longer means the
  only signal is the in-app banner.
- **Rejected → office.** The owner/admin reject path:
  `notify({ recipientUserId: <uploader>, type: ReplenishmentRejected,
  channels: ['in_app'] })` — or `role: Role.Office` to reach the whole office team rather
  than only the uploader (WMS's call). The deferred **"office rejection email"**
  (`10-wms/02` §6) becomes trivially adding `'email'` to `channels` — no new plumbing.
- **The WMS pending-approval banner stays WMS-owned.** It's an *actionable count* off
  `pendingImports`, a different surface from the *notification history* bell — the two
  coexist. (Folding the banner into a pinned notification is a later option, §7.)
- **What WMS keeps:** the `notifications.manager_user_id` settings key + the `settings`
  module (recipient resolution is the caller's job). This module never reads `settings`.

Net effect for WMS: delete the ad-hoc `sendEmail` compose + gain a persisted, live, in-app
channel for free; the "notify admins of pending approvals" item is fully served.

---

## 5. Testing

Vitest against live Neon (house convention), `notif-test-` fixture prefix:

- `notify()` inserts an `unread` row; `channels:['in_app']` leaves `email_status` null.
- **Role broadcast**: `notify({ role: 'admin' })` inserts one `unread` row per active admin,
  each with `audience_role='admin'`; **soft-deleted users excluded**; multi-role
  (`[owner, admin]`) **deduped**; `recipientUserId` present **wins** over `role` (one row,
  `audience_role` null); a role with **no active users** → zero rows, no error; the `email`
  channel fans out **one best-effort email per recipient**; `neither given` → throws.
- Email best-effort: `email` channel with a stubbed transport → `sent`; forced transport
  error → `failed` + `email_error`, **and the in-app row still commits** (no throw/rollback);
  recipient without an email → `skipped`. De-branding: neutral brand → bare `RESEND_FROM`,
  named brand → quoted display name.
- Read scoping: `POST /:id/read` on another user's row → `404`; `read-all` only flips the
  caller's rows; `unread-count` reflects both.
- **Retention sweep**: rows `> 8 months` old deleted, newer kept; count logged; no audit
  table touched.
- SSE: a new row appears on the stream within a tick; `15 s` heartbeat present; client
  disconnect ends the handler; **no terminal close** on an idle feed.

Frontend e2e (`page.route`, scripted `text/event-stream`): bell badge increments off a
streamed notification; opening the panel renders items with labels/icons; clicking marks
read + navigates the deep link + decrements the badge; `read-all` clears it; reconnect
re-syncs from the one-shot GET.

---

## Checkpoints

### CP-1 — Backend core
- [ ] `notifications` table + indexes (additive DDL applied to live Neon; migration SQL
      generated for the record; relation + re-export in `database/schema.ts`); enums.
- [ ] `notify()` service (user-or-role resolution + fan-out, §2.1; insert + best-effort
      de-branded email compose per recipient, §2.1/§2.3);
      `GET /notifications` (+`unreadCount`), `POST /:id/read`, `POST /read-all` — all
      self-scoped; `notification_not_found` typed error.
- [ ] §5 backend tests green (insert, email best-effort/de-brand, read scoping).

### CP-2 — SSE + retention
- [ ] `GET /notifications/stream` (`streamSSE`, per-user, `~2 s` re-read + `15 s`
      heartbeat, session-length, Bearer-authed).
- [ ] Retention cron: `wrangler.toml` `triggers.crons` + the `export default { fetch,
      scheduled }` switch + `notifications-retention.service.ts` (8-month `DELETE`).
- [ ] §5 SSE + retention tests green; `wrangler dev` runs the stream + cron locally.

### CP-3 — Frontend surface
- [ ] Extract `sseStream<T>` shared reader (§3.1); `NotificationsState` + service.
- [ ] Notification-center bell + panel in the app-shell (badge, list, mark-read,
      mark-all, deep-link nav); constants/pipes/DTO per house rules (one-per-file, no
      barrels, no template method calls).
- [ ] Frontend e2e green (§5).

### CP-4 — WMS wiring (realized on the WMS branch when both exist)
- [ ] WMS `ready`/`failed`/`rejected` paths call `notify()` (§4); WMS's direct `sendEmail`
      compose removed; WMS-side plan docs + `14-access-control.md` row updated (that PR).
- [ ] End-to-end: a WMS import reaching `ready` pushes a live bell notification + a
      de-branded email to the configured manager.

---

## Open decisions / asks
- **Placement of this initiative** — proposed as a standalone `.claude/plans/notifications/`
  (shared infra, off the superadmin build-order numbering where 16 is pinned last). If you'd
  rather it be a numbered superadmin module or folded under `10-wms/`, say so.
- **PR scope** — this PR is intentionally **just this plan** (atomic, no cross-branch churn
  with WMS PR #76 / in-flight superadmin PRs). The WMS-side rewrites (§4) + the
  `14-access-control.md` row + a backend-plan pointer are **follow-ups on their own
  branches**. Confirm you want it kept that way vs. bundling the cross-refs now.
- **SSE watcher cost** — v1 re-reads the DB per connected user every `~2 s` (same as WMS).
  Fine at current scale (few concurrent admins/tenant); revisit Postgres `LISTEN/NOTIFY`
  only if watcher load ever matters (same note as `10-wms/02` §6).
- **Cron prerequisite** — introduces the first Worker cron. No Queues/paid-plan dependency
  for notifications retention specifically (unlike WMS's Queues-coupled sweep). Confirm the
  `scheduled()` handler wiring is acceptable to land here first.
- **Actor self-notification** — a role broadcast currently reaches *every* user of the role,
  including the one whose action triggered it (e.g. an owner who resubmits, in a
  `[owner, admin]` fan-out). If that proves noisy, add an optional `excludeUserId` to
  `notify()` (skip the actor) — not built v1; the caller has the actor id if needed.
- **Single-role assumption** — the design assumes each user has exactly one role (the
  baseline model). If multi-role users ever land, `audience_role` (a single role) and the
  dedup logic get revisited; flagged, not a v1 concern.
- **Deferred (revisit on demand):** a full `/notifications` history page (v1 = panel only);
  a per-user preference center (mute types/channels); `archived` status; additional channels
  (push/WhatsApp) behind the same `notify()` seam; folding the WMS approval **banner** into a
  pinned notification.
