# Manttio — Whitelabeled Backend Plan (superadmin-driven surface)

**Repo:** this fork (`manttio-whitelabeled`), `backend/` package.
**Role:** the tenant-scoped API each whitelabel instance runs — Hono on CF Workers + Neon +
Drizzle, module-first per `backend/CLAUDE.md`. This plan consolidates the **backend
obligations decided during superadmin planning** (`.claude/plans/superadmin/00-13`) so they live on
the backend side too; each superadmin plan file remains the source for its module's UI/UX
detail and lists its asks under "Open decisions / asks".

System map: superadmin (product-user-auth) + field app (`frontend/`) + public site
(`website/`-replacement, CMS read) → **[this] whitelabeled backend** ← manager backend
(shared-token config push, KV status gate).

> Status headers + `- [ ]`/`- [~]`/`- [x]` checklist convention as in
> `.claude/plans/superadmin/00-master-plan.md` §2.

---

## 1. Auth & gating (superadmin plans 02, 14)

- **Superadmin login** (product users, never the shared token) + **`GET /auth/me` →
  `{ user, role, tenantConfig }`** — the single gating input the superadmin boots on.
  **No forgot-password / reset-email endpoint in v1 (decided 2026-07-05):** the login
  screen carries a contact-the-owner disclaimer instead; resets happen owner/admin-side
  through the users module (superadmin plan 02 §3, 05).
- **Password-reset hierarchy (decided 2026-07-05, shipped 2026-07-09)** —
  `POST /users/:id/password`, enforced server-side per pairing
  (`PASSWORD_RESET_PAIRINGS` in `users/enums`): **owner** resets
  admins/office/technicians; **admins** reset office/technicians only (never another
  admin, never the owner); the **owner's** password is never resettable in-tenant —
  locked-out owner goes through the manager/support path. Disallowed pairing →
  `403 cannot_reset_password`. (Superadmin plans 05 §2, 14 §2 note 1.)
- **Temp-password model (decided 2026-07-05, shipped 2026-07-09):** reset (and
  `POST /users` create when `password` is omitted — supplying one is the legacy
  field-app path until that UI adopts the flow) generates a temporary password —
  **always `tmp_` + 18 random chars** (nanoid `customAlphabet`, look-alikes dropped;
  `users/utils/temp-password.ts`) — returns it **once** in the response (no email
  flow), and sets `must_change_password` (migration `0012`). The **login response**
  and `PublicUser` expose the flag (`/auth/me` carries it too, shipped 2026-07-14);
  **`POST /auth/password`** (change own — **new password only**, matching the shipped
  superadmin dialog: the caller just authenticated with the temp password) clears it —
  the superadmin blocks entry behind an unskippable change dialog until then (plan 02
  §3). **Cross-app note:** the flag rides the shared `users` table, so a reset
  technician logging into the **field app** hits it too — the fork `frontend/` needs
  the same forced-change handling (record with the field-app font-migration fork
  tasks). Open: temp-password expiry (05 open decisions).
- **`role` enum on `users`:** `'owner' | 'admin' | 'office' | 'technician'` — migration
  on the existing users table **plus** the hardcoded role surfaces:
  `auth/middleware/jwt.middleware.ts`, `requireRole` call sites, and `users/enums`.
  **Owner protection:** admins cannot edit/delete/re-role the owner or grant `owner`.
  **`owner` slice shipped 2026-07-07 (migration `0010`):** role check + JWT middleware +
  enums accept `owner`; `GRANTABLE_ROLES` keeps it out of the users API; owner-row
  mutations → `403 cannot_modify_owner`. **Hierarchy (decided 2026-07-07): owner is
  always above admin**, enforced as **explicit allow-lists** — `requireRole(roles[])`
  has no implicit pass-through; every admin gate lists `['owner', 'admin']` and inline
  branches use `isAdminTier`/`ADMIN_TIER` (`auth/utils/role-tier.ts`), so owners hold
  the full admin surface (users/customers/reports/cms) with per-route granularity for
  the future (owner-only or office-included gates just change that route's array).
  Still pending: `office` (lands with the users-module backend work) and
  owner-*exclusive* surfaces like `PUT /brand` (plan 14).
- **Backend is the sole authority**: every endpoint enforces tenant-config *and* role on
  its own — superadmin rendering/guards are UX only (`.claude/plans/superadmin/14` §2 matrix and
  §2.1 WMS action matrix are the binding spec).
- **Tenant config** arrives via the manager push:
  `modules: { billing, wms, crm, cms, scheduling }` (tentative — `scheduling` covers
  calendar + contracts; equipment rides core clients; flag split still open in 14).
  Push schema also needs a **tenant timezone** field (calendar/date rendering).

## 2. Cross-cutting invariants (decided 2026-07-05, master plan §4)

- **Soft deletes** for user-facing resources (existing convention) — now also customers'
  CRM extensions, equipment, contracts.
- **Append-only audit trails — no UPDATE/DELETE paths at all** on: WMS `movements`,
  visit `assignment_history`, CRM `interactions`. Corrections are new compensating
  records (WMS `readjustment` movements; report-material corrections emit them
  server-side).
- **Tenant-customizable definition entities** (`movement_reason_defs`,
  `contract_type_defs`): immutable auto-slugged `code`, `PATCH` limited to
  `label`/`active`, **no DELETE endpoint**, seeded per tenant. Reason built-ins locked;
  contract-type seeds unlocked: `installation`, `lease`, `one_time_maintenance`,
  `recurring_maintenance`, `repair_servicing`.

## 3. Module obligations (pointers — detail in the superadmin plan named)

- **customers** (07/08): net-new columns `status`, `source`, `blacklist_reason`,
  `next_follow_up_at`, `referred_by_customer_id`, `tags`, fiscal block (CFDI 4.0
  basics), plus a `customer_contacts` table. Dedicated
  `POST /customers/:id/status` transition endpoint (audits + emits a `system`
  interaction). `interactions` endpoints: paged GET, POST **rejecting
  `type: 'system'`** (system entries are backend-emitted only). Optional
  summary figures (last service / totals) for the client 360 header.
- **branding** (03 — **build first among modules**: whitelabel selling point,
  prioritized 2026-07-05): own module (`modules/brand/`), **separate and independent
  from cms** (decided 2026-07-05). The tenant brand object (supersedes
  brand-as-manager-push): name/slogan, `logo`/`logo_dark`/`isologo` R2 keys, contact +
  social, and **materialized color scales** (primary 50–950, surface 0–950 — derived
  in the editor from two hex picks, stored ready-made so no consumer runs palette
  math). **`GET /brand` is public/unauthenticated** (login screens + website read it
  pre-auth; every field is public by nature — read served through the per-tenant cache DO, §5); **`PUT /brand` is owner-only** — not
  under `/cms`. **Direct-apply — no draft variant** (single row, `PUT` goes live).
  Brand is **core — not gated by the `cms` module flag** (it themes apps + PDFs even
  without a website). The **pdf and email modules read brand at render time**
  (isologo, name, primary) — the whitelabel-PDF hook; for tenant-facing rendering this
  supersedes the static `BRAND_*` wrangler vars. **Two write paths (decided
  2026-07-05):** owner-authed `PUT /brand` *and* the manager's shared-token push
  (provisioning seed + corrections) — same single row, last write wins.
  **Typography (decided 2026-07-05):** `brand.font { body, heading? }` — codes
  validated against a **curated OFL variable-font catalog**: a backend constants
  list (no DB rows — nothing font-related in Neon) served by `GET /fonts` (public),
  binaries in the dedicated shared **`branding-fonts` R2 bucket** (CDN-fronted):
  one latin-subset variable woff2 + static TTF instances **400/600/700** per family,
  cut at catalog build time. **Contents decided 2026-07-05 — launch set of 10**
  (codes/groups table in superadmin plan 03 §2.1): Work Sans, Rubik (defaults),
  Inter, Public Sans, Archivo, Figtree, DM Sans, Plus Jakarta Sans, Sora,
  Source Serif 4 (heading-recommended); append-only, Commissioner excluded. The **pdf module embeds the tenant font's static
  instances** via fontkit (fetched from R2 at render, cached); **emails keep system
  font stacks**. Tenant font *uploads* are a **deferred later phase** (design in
  superadmin plan 03 §2.1: per-tenant `font_defs` + own-bucket files + license
  attestation). Frontend obligation (both apps, this
  fork): Tailwind palette **and font stacks** → CSS variables set from the boot brand
  fetch (injected `@font-face`, service-worker cached), manttio / Work Sans + Rubik
  defaults as fallback.
- **cms** (04 — first wave alongside 03): **headless content store (decided
  2026-07-05)** — `cms_home`/`cms_clients` documents served API-first; the tenant's
  public website is just one consumer, no site-specific coupling. Server-side HTML
  sanitization on write. **Draft→publish:** `GET /cms/home|clients` serve the draft to
  editors; `POST /cms/:section/publish` copies draft → published; public reads serve
  **published only**. Owner + admin, behind the `cms` module flag. **Tenant-only
  writes — CMS content has no manager push path** (decided 2026-07-05).
  **Implemented 2026-07-07 (`modules/cms/`, migration `0009`):** `cms_documents`
  (section-keyed draft/published jsonb; publish copies draft → published) +
  `cms_clients` entry rows snapshotted into the published doc on publish;
  whitelist HTML sanitizer (mirrors the editor CVA: b/strong/i/em/ul/li/p/br/div,
  attributes dropped); manufacturers `logoUrl` materialized from `logoKey` on
  read, never stored; service icon codes validated against the curated 12
  (superadmin 04 §6); public reads at `GET /public/cms/home|clients` (never
  published → 404 so the site keeps its fallbacks). Gated `requireRole('admin')`
  for now — `owner` joins when the §1 role migration lands, the `cms` module
  flag when tenant-config enforcement exists.
- **reports** (06): confirm status enum/folio; soft delete with comment; PDF/resend
  as today. **Signature gate (decided 2026-07-05):** every report — whatever its
  template — **requires a captured signature to transition to `finished` and to be
  mailed**; enforce in the status-transition path (`report-lifecycle` predicates),
  not just field-app UX. **Answer snapshot model (decided 2026-07-05 — 06 §5.5):**
  reports carry `template_id` + template-shaped answer sections where **each answer
  freezes its question's `questionId` + label + datatype at capture** — view/list/PDF
  render from the snapshot, never by re-joining the live template (this is what makes
  no-versioning safe). `GET /reports` gains a `templateId` filter; summaries return
  `templateName`. **Sync acceptance (decided 2026-07-05):** template status gates
  *starting* captures only — submission **always accepts** a report captured against a
  now-draft/disabled template (offline-first; no field data rejected at sync).
  **Provisioning migration:** existing fixed-HVAC reports get retro-linked to the
  seeded template with answers expressed in the snapshot model, so every report
  renders through one path.
- **report templates** (06 §5 — decided 2026-07-05): new `report_templates` entity
  (name, `status: draft|active|disabled`, `sections` jsonb — **1..n ordered sections,
  each `{ title, columns: 1..3, questions[] }`** w/ per-question datatype/required/
  options/order — datatype enum **final (2026-07-05):** `text|textarea|number|date|
  boolean|select|multiselect|radio|checkbox_group` (`options[]` required for the last
  four) — plus optional per-question **validation `constraints` (in v1, decided
  2026-07-05):** number `min`/`max`, text/textarea `maxLength`, date `minDate`/
  `maxDate` — **enforced server-side on report submission** (answers validated
  against the template's constraints), mirrored in the field-app form —
  `disabled_reason`/`disabled_by`/`disabled_at`).
  Endpoints: CRUD (**PATCH draft-only, server-enforced**), `POST :id/activate`,
  `POST :id/deactivate` (active → draft — the edit path; **no versioning in v1**,
  accepted that edits re-render previously captured reports), `POST :id/disable
  {reason}` (terminal) — owner/admin only; the **field app fetches active-only**.
  Fixed skeleton server-side: heading (business + client info) → sections → images
  block → comments + **signature** (see reports bullet — finished/mailed gate).
  **Seed template at provisioning (decided 2026-07-05):** every tenant starts with
  the current HVAC report expressed as sections/questions — a normal editable row,
  created by the provisioning/manager-push flow. Two heavyweight obligations: (a) the
  **field app renders capture forms dynamically** from a template's sections
  (datatype → input control + constraint enforcement; **template picker** when >1
  active template — single active skips it; submission stores the answer snapshot —
  see reports bullet) — fork `frontend/` task; (b) the **PDF pipeline renders
  template-driven layouts** —
  fixed heading + images + comments + signature framing per-section 1–3-column blocks
  from the `pdf/` toolkit, replacing the single hardcoded HVAC layout — **rendered
  from the report's answer snapshot, not the live template**. No open items
  — the template spec is fully decided (06 §5, incl. §5.5 binding/snapshot).
- **billing** (09): bills + items (`report_id` per item), status flow with
  office-draft / owner-admin-send gating; report on ≤1 non-cancelled bill.
- **wms** (10): the largest surface — stock endpoints all require a `reason`;
  self-checkout constraints server-enforced; replenishments with backend file parsing
  (`POST /replenishments/parse`, SheetJS-on-Workers CPU check) + R2 evidence;
  movements append-only per §2.
- **equipment** (11): `equipment` table + `report_equipment` join; retro-link
  endpoints; hook: serialized unit consumed on a report ⇒ offer/auto-create the
  client `Equipment` (`material_unit_id` backlink).
- **visits** (12): `scheduled_visits` + append-only `visit_assignments`;
  `POST /visits/:id/assign` enforces the tech-swap rule (**a technician may reassign
  only a visit currently assigned to them — give away, never take**); range-bounded
  list; status endpoint; report→visit completion hook (heuristic open).
- **contracts** (13): lifecycle `draft → active → expired | cancelled`;
  `POST /contracts/:id/activate` generates evenly-spaced visits (`contract_id`
  backlink); cancel cascades to remaining `scheduled` visits only; types per §2.

## 4. Google Calendar integration module (decided 2026-07-05 — superadmin plan 12 §7)

New `modules/google-calendar/` (cross-cutting integration module, like `email/`).
**One-way push + read-only external overlay; two-way write-back rejected.**

### 4.1 Credentials & connection

- Google Cloud project, Calendar API enabled, OAuth **Web** client. Scope:
  **`calendar.events` only** (covers both directions on the primary calendar).
- Secrets: `GOOGLE_CLIENT_ID` (env var) + `GOOGLE_CLIENT_SECRET` (**`wrangler secret`**,
  `.dev.vars` locally — never committed, never shipped to the browser).
- Flow endpoints (own account only): `GET /integrations/google/connect` (OAuth
  redirect w/ state), callback exchanges the code, `GET /integrations/google/status`,
  `POST /integrations/google/disconnect` (revoke + forget).
- **Refresh token per user, encrypted at rest in Neon** (`google_accounts` table or
  columns on `users`); access tokens minted on demand (~1h), plain REST `fetch` — **no
  googleapis SDK on Workers**. A 401/revocation marks the account disconnected
  (superadmin shows a reconnect chip).
- **Known costs (accepted):** sensitive-scope verification — park the Cloud project in
  review **early**, it's the long pole (weeks; unverified = 100 test users + 7-day
  refresh tokens) — and a **single-brand consent screen across all whitelabel tenants**.

### 4.2 Outbound push (visits → Google)

On visit create/update/cancel where the affected user is connected: mirror to their
**primary** calendar with `extendedProperties.private.visitId` as the correlation key
(update/cancel replace/delete by that key). **The app is source of truth** — Google-side
edits to pushed events are never read back; the next push overwrites.

### 4.3 Inbound overlay (`GET /visits/external?from&to`)

- `events.list` per connected user for the range; drop events carrying our `visitId`
  property; return `ExternalEvent { userId, start, end, title?, matchedCustomerId?,
  matchedCustomerName? }`. **Never persisted as visits; short server-side cache only**
  (minutes). No webhook/watch channels.
- **Title redaction is server-side, per requester**: full title only when the requester
  *is* the event's user; everyone else gets it stripped ("Ocupado (Google)" copy is
  frontend's). The **raw attendee list never leaves the backend**.
- **Client matching by email (decided 2026-07-05):** compare `attendees[].email` +
  organizer (excluding the connected user) against `customers.email`,
  `customer_fiscal.billing_email`, `customer_contacts.email` — **case-insensitive exact
  match only**. Exactly one client hit ⇒ set `matchedCustomerId/Name` (visible to all
  staff roles even when the title is redacted). Zero hits or an email mapping to
  multiple clients ⇒ unmatched — **never guess**.
- **Domain-level matching is permanently rejected (2026-07-05):** distinct client
  records can share an email domain (branches/locations of one organization served
  separately) — "anyone `@hotelx.com`" would mis-link across branches. Per-branch
  precision comes from each branch's own `customer_contacts` emails.

---

## 5. Per-tenant cache Durable Object — brand + CRM reads (decided 2026-07-06)

New cross-cutting module `modules/tenant-cache/` (generic, like `email/`/`pdf/`): a
**SQLite-backed Durable Object** class, **`TenantCacheDO`**, one instance per tenant
(`env.TENANT_CACHE.getByName(tenantId)`), fronting Neon on the hot read paths:

- **Brand (superadmin plan 03 §5.1):** `GET /brand` is the hottest read — every website
  visit + both apps' pre-auth boot, public — against a row that almost never changes.
  The DO caches the materialized brand object.
- **CRM (superadmin plan 08 §4.1):** hot list projections (leads by follow-up,
  blacklist, source counts) and the first timeline page per customer. Exact v1
  projection set is an open question (§6).

Pattern:

- **Cache-aside inside the DO:** on a miss the DO itself queries Neon (same WS driver)
  and stores the result in its SQLite storage — per-tenant single-threading collapses
  concurrent cold reads into one Neon query (no dogpile).
- **Write-through invalidation, Neon first:** every write path commits to Neon, then
  refreshes/deletes the affected keys in the same request — `PUT /brand` **and the
  manager's shared-token brand push**, `POST /customers/:id/status`,
  `POST /customers/:id/interactions`, `PATCH /customers/:id`. The brand entry is
  re-primed eagerly (a stale login screen is exactly what the DO buys off).
- **TTL safety net via alarm:** a single `setAlarm()` sweep expires entries past a
  conservative TTL, catching missed invalidations (out-of-band DB edits, new emitters).
- **Wrangler:** `durable_objects` binding `TENANT_CACHE` + a `new_sqlite_classes`
  migration tag; class exported from the composition root (`src/index.ts`).
- **Neon stays the source of truth.** The DO is a disposable, rebuildable cache — never
  the system of record; wiping an instance costs one cold read. DO instances are
  single-location (pinned near first access ≈ the tenant's region; traffic is
  region-local, acceptable).

## 6. Open questions (backend-side)

- Manager push schema: final `modules` flag set (incl. `scheduling` split) + tenant
  timezone field — coordinate with `manttio-manager-backend-plan.md`. Note
  `customers.timezone` (IANA) already exists for report rendering; the tenant-level tz
  is the *default/fallback* (visit times, tenant-wide views), not a replacement.
- SheetJS `.xlsx` parsing within Workers CPU limits (10) — verify before building
  `/replenishments/parse`.
- Report→visit completion heuristic (12) vs explicit visit pick in the field app
  (upstream change).
- Encryption approach for stored refresh tokens (app-level AES-GCM with a Workers
  secret key vs relying on Neon at-rest only) — decide before 4.1 lands.
- `expired` contract status + `missed` visit sweep both want a cron — one scheduled
  Worker handler covers both when either becomes real.
- PDF font embedding cost on Workers (fetch TTF from R2 + fontkit embed per render):
  measure when pdf brand consumption lands; cache font bytes in-isolate, subset the
  static instances if size bites.
- Tenant-cache DO (§5): exact CRM projection set cached in v1 (leads/blacklist/source
  counts vs timeline first page too); whether brand + CRM stay in the one
  `TenantCacheDO` class or split per concern — start shared, split only if CRM churn
  crowds the brand entry.
- ~~Website read surface (superadmin plan 15): public published-read route shape~~ —
  **decided + shipped 2026-07-07: `GET /public/cms/home` · `GET /public/cms/clients`**
  (bare doc / bare array, matching the website fetchers in PR #44; 404 until first
  publish). Still open: whether published docs join the `TenantCacheDO` (§5) with
  invalidation on `POST /cms/:section/publish` (same hot-public profile as
  `GET /brand`) — they read Neon directly until then.

## 7. Build checklist

**Auth & config**
- [x] `role` migration + owner protection + superadmin login + `GET /auth/me`
      (role work shipped 2026-07-09; `GET /auth/me` landed 2026-07-14 **without
      `tenantConfig`** — the tenant module-flag feature is a **pending item**
      stripped from the auth/users surface entirely; direction noted 2026-07-14
      is flags applied at app **build time**, shape TBD when the feature is
      picked up. Flagged superadmin modules stay off meanwhile — `hasModule`
      passes core (unflagged) modules only)
- [ ] Tenant-config enforcement middleware (module flags) + role checks per route

**Cross-cutting**
- [ ] Append-only guarantees (no UPDATE/DELETE) on movements / visit assignments /
      interactions
- [ ] Definition-entity endpoints + per-tenant seeds (reasons locked, contract types
      unlocked)
- [ ] `TenantCacheDO` (`modules/tenant-cache/`, SQLite DO): binding + migration,
      cache-aside brand/CRM reads, write-through invalidation hooks, alarm TTL sweep
      (§5)

**Modules** *(each gated by its superadmin plan's checkpoints)*
- [ ] **branding — first** (prioritized 2026-07-05): `modules/brand/` — public
      `GET /brand` + `GET /fonts` (curated catalog), owner-only `PUT /brand`,
      materialized scales, font codes validated; pdf render-time brand consumption
      incl. static-instance font embedding (emails: colors/logo only)
- [x] **cms — first wave, alongside branding**: headless content endpoints
      (draft→publish, sanitize on write, published-only public reads) —
      **done 2026-07-07** (`modules/cms/`, migration `0009`, `test/cms.test.ts`;
      owner-role + `cms`-flag gating pend the Auth & config items above)
- [ ] customers CRM extensions + contacts + interactions + status transition
- [ ] billing · wms (incl. replenishments parse + R2 evidence) · equipment ·
      visits/assignments · contracts (activate → visit generation)

**Google Calendar**
- [ ] Cloud project + consent screen submitted for verification (early — long pole)
- [ ] Connect/callback/status/disconnect + encrypted refresh-token storage
- [ ] Outbound push (visitId correlation, overwrite semantics)
- [ ] `GET /visits/external` (cache, per-requester redaction, exact-email client match)
