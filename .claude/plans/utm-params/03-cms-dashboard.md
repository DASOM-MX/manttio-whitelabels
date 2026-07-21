# utm-params 03 — CMS dashboard (intake metrics per source)

> **Status:** done (CP-1 + CP-2 · build green · backend suite 11/11 green vs live Neon 2026-07-21 · PR #80 pending review) · **Depends on:** [01-fullstack-implementation](01-fullstack-implementation.md) (CP-1 columns incl. the `status_changed_at` amendment; data flows once 02 ships) — **both shipped as of 2026-07-20**
> **Owner:** worktree `fullstack-cms-dashboard` · **Last updated:** 2026-07-20
> **PR:** PR-C `feat(fullstack)` on branch `feature/fullstack-cms-dashboard` (after PR-A merges) · base `main`

A marketing-performance dashboard for the tenant: how many clients each acquisition channel is bringing in, split into leads and actives, this month vs last month. ~~It lives as a tab in the **CMS submenu** of the superadmin main nav (the CMS group owns the public-site surfaces; this is the site's performance view).~~ **Superseded 2026-07-20 (owner): it lives under the Clientes (CRM) group** — nav child "Panel" first in the group, route `/customers/dashboard`, page component `crm/pages/dashboard/`. Nav child label renamed **"Panel" → "Dashboard"** (owner, same day). **Office admitted 2026-07-20 (owner):** the dashboard uses the Clientes module gate as-is (owner/admin/office; technicians excluded) — the interim child-level role gate built during the relocation was reverted the same day. The CMS submenu keeps only Home/Clientes.

## Settled decisions (2026-07-16)

- **Group by the normalized `source` enum** (10 values) — not raw `utm_source` (unbounded free text). Website leads derive `source` from `utm_source` at insert (doc 01), so channel rows stay stable and offline intake (phonecall, referral, personal_meeting) appears alongside.
- **Comparison window: current month-to-date vs the full previous month.** Accepted caveat, surfaced in the UI: early in the month the delta reads low because a partial period is compared against a complete one — the period labels must make this visible (e.g. "1–16 jul" vs "junio").
- **Conversion tracking via `status_changed_at`** (added to doc 01's migration 0016 by this plan): stamped by `editCustomer` (and any future status-transition endpoint) whenever `status` changes; `NULL` means the row still holds its birth status. Queries read `coalesce(status_changed_at, created_at)` as "when the current status took effect".
- **Metric definitions** (snapshot semantics — a lead that converts moves from the leads column into the actives column of the period it converted in; immutable per-event history is plan 08's interactions timeline, not this):
  - `leads` = count of rows with current `status = 'lead'` whose `coalesce(status_changed_at, created_at)` falls in the period — new leads still open.
  - `active` = count of rows with current `status = 'active'` whose `coalesce(status_changed_at, created_at)` falls in the period — conversions plus born-active rows.
  - Soft-deleted rows excluded everywhere (`deleted_at is null`).
- **Rendering: charts via `chart.js` + PrimeNG `p-chart`** (new dependency, accepted). Brand-token colors, dark-mode aware. **Revised 2026-07-20 (owner): pie charts, not grouped bars** — each pie shows the current-period channel mix (zero channels dropped), sliced through a single-hue primary-scale ramp with a right-side legend; the previous-month comparison lives in the KPI deltas, not the charts.

## Amendment 2026-07-20 — latest-activity feed (owner directive)

The Panel also surfaces the **latest interactions registered on clients**, owner/admin
only (same gate as the intake stats). Backend: `GET /customers/interactions/recent`
(`?limit`, default 10, max 50) — tenant-wide, newest-first, joins the customer name,
excludes soft-deleted customers' timelines (append-only storage untouched); declared
beside the stats route in the customers controller. Superadmin: an "Actividad
reciente" list on the Panel alongside the charts, reusing the timeline row idiom
(type icon, relative time, author), each row linking to its customer view. Second
directive (same day): a **recent clients** list right beside the activity feed —
name, business name, registration date, source; each row links to the client's
details. Backend: `GET /customers/recent` (`?limit`, default 8, max 50), display
fields only, newest first, soft-deleted excluded, same owner/admin gate. Work items
appended to CP-1/CP-2 below.

## Amendments to doc 01 CP-1 (recorded here, executed there)

- `customers.status_changed_at` — `timestamp('status_changed_at', { withTimezone: true })` nullable, no default (birth status ⇒ NULL; readers coalesce to `created_at`). Stamped in `editCustomer` when the incoming `status` differs from the stored one; belongs in `UpdateCustomerFields` (service-derived) but **never** in request validators.
- `customers_source_idx` partial index on `source where deleted_at is null` (the dashboard groups by it) — migration 0016 becomes 13 ADD COLUMN + 3 checks + 5 indexes.

## CP-1 — Backend: intake stats endpoint

- [x] `customers/validators/customer-stats.validator.ts` — `intakeStatsQuerySchema`: optional `month` as `YYYY-MM` (regex + valid-month refine), defaults to the current month server-side.
- [x] `customers/repository/customer-stats.repository.ts` — one grouped query per period (current MTD, full previous month): `select source, status, count(*) … where deleted_at is null and status in ('lead','active') and coalesce(status_changed_at, created_at) >= $from and < $to group by source, status`. Return typed rows; `source` may be NULL for legacy/staff rows — bucket as `'other'` in the service, don't drop.
- [x] `customers/services/customer-stats.service.ts` — `getIntakeStats(db, month?)`: compute the two ranges (tenant-agnostic UTC for v1; note the known tz coarseness — customer rows carry IANA timezones but monthly buckets in UTC are acceptable at this granularity), run both counts, and shape:
  `{ period: { from, to }, previous: { from, to }, totals: { leads, active, prevLeads, prevActive }, rows: [{ source, leads, active, prevLeads, prevActive }] }` — one row per enum member that has any count, ordered by `leads + active` desc.
- [x] `customers/controllers/customers.controller.ts` — `GET /stats/intake` with `requireRole(['owner', 'admin'])` (matches the CMS module gate), `zValidator('query', …)`. **Route must be declared before `GET /:id`** or "stats" is captured as an id.
- [x] Amendment (2026-07-20): `GET /customers/interactions/recent` — `recentInteractionsQuerySchema` (limit 1–50, default 10), `listRecentInteractions` (users + customers joins, `isNull(customers.deletedAt)`), `getRecentInteractions`, owner/admin route; `RecentInteractionDTO` carries `customerName`.
- [x] Amendment (2026-07-20): `GET /customers/recent` — `recentCustomersQuerySchema` (limit 1–50, default 8), `listRecentCustomers`/`getRecentCustomers` returning `RecentCustomerRow` (id, name, contactName, clientType, source, createdAt), owner/admin route before `GET /:id`.
- [x] Office admitted (owner, 2026-07-20): all three dashboard reads gate `requireRole(['owner', 'admin', 'office'])`; `seedOffice`/`seedOfficeAndLogin` fixtures + an office-200 test added (technician stays 403).
- [x] Perf revision (owner ask, 2026-07-21): the two per-period grouped queries merged into **one single-scan query** with `count(*) FILTER` buckets per source — the windows are contiguous (`previous.to === period.from`), so one overall range bounds the scan; halves the Neon round trips. `count(*)` kept deliberately: in Postgres it IS the fast path (`count(1)` adds a per-row null-check on the constant — the "count(1) is faster" tip is MySQL/Oracle folklore). New `IntakeSourceCounts`/`IntakeTotals` types. `customers_intake_effective_idx` (expression, partial: `coalesce(status_changed_at, created_at)` over live lead/active rows) declared in the model for the range predicate and **applied to the live DB out-of-band 2026-07-21 (owner sign-off)**. Suite re-run after the refactor: 11/11 green.
- [x] Tests: `test/customer-stats.test.ts` (delta-based assertions over fixed 2020-05/04 fixture months so reruns/parallel data never skew; covers bucketing, coalesce conversion, soft-delete exclusion, ordering, period boundaries, MTD default, role gates incl. office-200/technician-403, bad month, and both recent feeds incl. soft-deleted-customer exclusion) — **run 2026-07-21 with owner sign-off: 11/11 green vs live Neon** (post-teardown "Network connection lost" noise from the WS pool is expected suite-wide; assertions unaffected). NULL-source → `other` stays service-side only: the live column is NOT NULL with default, so the case can't be seeded.
- [x] `pnpm typecheck` green.

## CP-2 — Superadmin: CMS › Panel page

**Load the `superadmin-design` skill and the `dataviz` skill before building this page** (chart form, palette, and dashboard layout rules).

- [x] `npm i chart.js` + PrimeNG `ChartModule` (`p-chart`) — confirm the PrimeNG 21 peer range; charts render client-side only, fine under zoneless.
- [x] `data/dtos/customer-stats.ts` — response DTOs mirroring the endpoint shape (types out of component bodies; page view-models in `data/types/cms/panel.types.ts`).
- [x] `app/services/http/customer-stats.service.ts` — `getIntake(month?)` + the two feed reads. ~~single-fetch page data, held in component signals (no NGXS state — nothing cross-page here)~~ — **superseded 2026-07-20 (owner):** cached in `CustomerStatsState` (`state/customer-stats/`, lazy-provided on the cms route) so revisits render from state without refetching; actions carry `refresh` for retries / future filter changes / boot prefetch.
- [x] `cms/pages/dashboard/` — route `/cms/dashboard` in `cms.routes.ts` (no `pendingChangesGuard`; read-only page). Layout:
  - Header: h1 "Panel" + lede naming both period labels explicitly ("1–16 jul vs junio") so the MTD-vs-full-month comparison is honest.
  - Totals strip: leads and actives for the period with delta vs last month (plain figures, not a chart-junk duplicate).
  - Two grouped-bar charts (`p-chart type="bar"`): **Leads por canal** and **Activos por canal** — x = source (es_MX labels from a `model/constants/customer/source-labels.const.ts`, one constant per file), two series: current period vs previous month. Colors from brand theme tokens via the existing theme services (`app/services/theme/`), dark-mode aware (re-read CSS vars on theme change); axis/gridline styling per the dataviz pass.
  - Skeletons while loading; empty state when both periods are all-zero ("Aún no hay datos de captación — comparte tus enlaces de contacto", linking to `/customers/share-links`). *Built 2026-07-20 with the link pointed at `/dashboard` instead — CP-3 shipped share links as the main-dashboard header menu; no `/customers/share-links` page exists.*
- [x] "Actividad reciente" list (amendment 2026-07-20): recent-feed fetch beside `getIntake` in the same http service, timeline-row idiom reuse (type icon, relative time, author), rows link to the customer view; skeleton + empty state. **Limit 20 (owner, 2026-07-20).**
- [x] "Clientes recientes" list (amendment 2026-07-20) right next to the activity feed: name + contact/business line + source label + relative registration date, each row links to `/customers/:id`; skeleton + empty state (limit 8).
- [x] `model/constants/access/nav-entries.const.ts` — CMS group children: prepend `{ label: 'Panel', route: '/cms/dashboard' }` before Home/Clientes.
- [x] Build green (`ng build`); no screenshots unless asked.
- [x] Enum parity fix ridden along (2026-07-20): superadmin `CustomerSource` + `CUSTOMER_SOURCE_LABELS` extended to the backend's 10 values (verified against the enum + `customers_source_check`); the customer form picks from the new `MANUAL_CUSTOMER_SOURCES` (7) so share-link-only channels are never hand-picked, while the list filter offers all 10.
- [x] Relocation (owner, 2026-07-20 — see the superseded intro): page moved `cms/pages/dashboard/` → `crm/pages/dashboard/` (`CrmDashboard`), route `/cms/dashboard` → `/customers/dashboard`, `CustomerStatsState` provided on the customers route, nav child moved CMS → Clientes (first). *The interim child-level role gate (`NavChild.roles` + `navFor` filter + route `accessGuard` data) was reverted the same day when office was admitted — the module gate covers it.*
- [x] UI revision (owner, 2026-07-20/21): pies replace the grouped bars (see the revised rendering decision); page renamed **"Dashboard"** (h1, nav child, route title); KPI tiles compacted to single-row figures; **final sizing (owner, 2026-07-21): fixed card heights** — charts `h-56` (224px, under the owner's 235px cap; **no arbitrary `[Npx]` Tailwind values in templates** — owner rule 2026-07-21; host + inner div forced `h-full` so chart.js's resize observer sizes the canvas; **PrimeNG 21 ignores `styleClass` on `p-chart`** — bind `class` on the host instead), the two feeds rebuilt as **`p-table`s for consistency** (owner, 2026-07-21: same header/body/row-click idiom as the customers lists, `[scrollable]` + `scrollHeight="16rem"` for the internal scroll, emptymessage templates), `!p-4` cards, `gap-3` page rhythm — verified no page scroll at a 900px-tall viewport. Full viewport-clamp variants (dvh calc, shell flex chain) were tried and **rejected as too much** — the shell layout stays untouched.

## Verification

1. Backend: seed a few rows via `db:studio`/fixtures across sources, statuses, and two months → `curl -H "Authorization: Bearer <owner token>" 'localhost:8787/customers/stats/intake?month=2026-07'` → shape + counts match; technician token → 403.
2. Superadmin: owner login → CMS › Panel: totals + two charts with both series, correct period labels, dark-mode legible; convert a lead (PATCH status) → it moves from the leads bars to the actives bars of the current month; empty tenant shows the empty state.

## Risks / notes

- **MTD vs full previous month** biases deltas low early in the month — accepted; mitigated by explicit period labels, revisit if owners misread it.
- **Snapshot semantics**: conversions rewrite history (a June lead converting in July leaves June's lead count). Accepted for v1; immutable event history belongs to plan 08's interactions.
- `status_changed_at` only records the **latest** transition — re-activations overwrite; fine for this dashboard's definitions.
- chart.js + zoneless: instantiate via `p-chart` props and feed data through signals; avoid manual `Chart` instances so change detection stays out of the picture.
- Month bucketing in UTC vs tenant timezone — coarse but acceptable at monthly granularity; the tenant-level timezone field (manager push, backend plan §6) can refine it later.
