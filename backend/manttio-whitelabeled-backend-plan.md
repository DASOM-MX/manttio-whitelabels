# Manttio — Whitelabeled Backend Plan (superadmin-driven surface)

**Repo:** this fork (`manttio-whitelabeled`), `backend/` package.
**Role:** the tenant-scoped API each whitelabel instance runs — Hono on CF Workers + Neon +
Drizzle, module-first per `backend/CLAUDE.md`. This plan consolidates the **backend
obligations decided during superadmin planning** (`superadmin/plans/00-13`) so they live on
the backend side too; each superadmin plan file remains the source for its module's UI/UX
detail and lists its asks under "Open decisions / asks".

System map: superadmin (product-user-auth) + field app (`frontend/`) + public site
(`website/`-replacement, CMS read) → **[this] whitelabeled backend** ← manager backend
(shared-token config push, KV status gate).

> Status headers + `- [ ]`/`- [~]`/`- [x]` checklist convention as in
> `superadmin/plans/00-master-plan.md` §2.

---

## 1. Auth & gating (superadmin plans 02, 14)

- **Superadmin login** (product users, never the shared token) + **`GET /auth/me` →
  `{ user, role, tenantConfig }`** — the single gating input the superadmin boots on.
- **`role` enum on `users`:** `'owner' | 'admin' | 'office' | 'technician'` — migration
  on the existing users table **plus** the hardcoded role surfaces:
  `auth/middleware/jwt.middleware.ts` (currently asserts `['admin','technician']`),
  `requireRole` call sites, and `users/enums`. **Owner protection:** admins cannot
  edit/delete/re-role the owner or grant `owner`.
- **Backend is the sole authority**: every endpoint enforces tenant-config *and* role on
  its own — superadmin rendering/guards are UX only (`superadmin/plans/14` §2 matrix and
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
  pre-auth; every field is public by nature); **`PUT /brand` is owner-only** — not
  under `/cms`. **Direct-apply — no draft variant** (single row, `PUT` goes live).
  Brand is **core — not gated by the `cms` module flag** (it themes apps + PDFs even
  without a website). The **pdf and email modules read brand at render time**
  (isologo, name, primary) — the whitelabel-PDF hook; for tenant-facing rendering this
  supersedes the static `BRAND_*` wrangler vars. Frontend obligation (both apps, this
  fork): Tailwind palette → CSS variables set from the boot brand fetch, manttio
  defaults as fallback.
- **cms** (04 — first wave alongside 03): **headless content store (decided
  2026-07-05)** — `cms_home`/`cms_clients` documents served API-first; the tenant's
  public website is just one consumer, no site-specific coupling. Server-side HTML
  sanitization on write. **Draft→publish:** `GET /cms/home|clients` serve the draft to
  editors; `POST /cms/:section/publish` copies draft → published; public reads serve
  **published only**. Owner + admin, behind the `cms` module flag.
- **reports** (06): confirm status enum/folio; soft delete with comment; PDF/resend
  as today.
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

## 5. Open questions (backend-side)

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

## 6. Build checklist

**Auth & config**
- [ ] `role` migration + owner protection + superadmin login + `GET /auth/me`
- [ ] Tenant-config enforcement middleware (module flags) + role checks per route

**Cross-cutting**
- [ ] Append-only guarantees (no UPDATE/DELETE) on movements / visit assignments /
      interactions
- [ ] Definition-entity endpoints + per-tenant seeds (reasons locked, contract types
      unlocked)

**Modules** *(each gated by its superadmin plan's checkpoints)*
- [ ] **branding — first** (prioritized 2026-07-05): `modules/brand/` — public
      `GET /brand`, owner-only `PUT /brand`, materialized scales + pdf/email
      render-time brand consumption
- [ ] **cms — first wave, alongside branding**: headless content endpoints
      (draft→publish, sanitize on write, published-only public reads)
- [ ] customers CRM extensions + contacts + interactions + status transition
- [ ] billing · wms (incl. replenishments parse + R2 evidence) · equipment ·
      visits/assignments · contracts (activate → visit generation)

**Google Calendar**
- [ ] Cloud project + consent screen submitted for verification (early — long pole)
- [ ] Connect/callback/status/disconnect + encrypted refresh-token storage
- [ ] Outbound push (visitId correlation, overwrite semantics)
- [ ] `GET /visits/external` (cache, per-requester redaction, exact-email client match)
