# utm-params 03 — CMS dashboard (intake metrics per source)

> **Status:** in-progress (CP-1 code done · tests written, not yet run — live-Neon suite pends sign-off) · **Depends on:** [01-fullstack-implementation](01-fullstack-implementation.md) (CP-1 columns incl. the `status_changed_at` amendment; data flows once 02 ships) — **both shipped as of 2026-07-20**
> **Owner:** worktree `fullstack-cms-dashboard` · **Last updated:** 2026-07-20
> **PR:** PR-C `feat(fullstack)` on branch `feature/fullstack-cms-dashboard` (after PR-A merges) · base `main`

A marketing-performance dashboard for the tenant: how many clients each acquisition channel is bringing in, split into leads and actives, this month vs last month. It lives as a tab in the **CMS submenu** of the superadmin main nav (the CMS group owns the public-site surfaces; this is the site's performance view).

## Settled decisions (2026-07-16)

- **Group by the normalized `source` enum** (10 values) — not raw `utm_source` (unbounded free text). Website leads derive `source` from `utm_source` at insert (doc 01), so channel rows stay stable and offline intake (phonecall, referral, personal_meeting) appears alongside.
- **Comparison window: current month-to-date vs the full previous month.** Accepted caveat, surfaced in the UI: early in the month the delta reads low because a partial period is compared against a complete one — the period labels must make this visible (e.g. "1–16 jul" vs "junio").
- **Conversion tracking via `status_changed_at`** (added to doc 01's migration 0016 by this plan): stamped by `editCustomer` (and any future status-transition endpoint) whenever `status` changes; `NULL` means the row still holds its birth status. Queries read `coalesce(status_changed_at, created_at)` as "when the current status took effect".
- **Metric definitions** (snapshot semantics — a lead that converts moves from the leads column into the actives column of the period it converted in; immutable per-event history is plan 08's interactions timeline, not this):
  - `leads` = count of rows with current `status = 'lead'` whose `coalesce(status_changed_at, created_at)` falls in the period — new leads still open.
  - `active` = count of rows with current `status = 'active'` whose `coalesce(status_changed_at, created_at)` falls in the period — conversions plus born-active rows.
  - Soft-deleted rows excluded everywhere (`deleted_at is null`).
- **Rendering: charts via `chart.js` + PrimeNG `p-chart`** (new dependency, accepted). Brand-token colors, dark-mode aware.

## Amendment 2026-07-20 — latest-activity feed (owner directive)

The Panel also surfaces the **latest interactions registered on clients**, owner/admin
only (same gate as the intake stats). Backend: `GET /customers/interactions/recent`
(`?limit`, default 10, max 50) — tenant-wide, newest-first, joins the customer name,
excludes soft-deleted customers' timelines (append-only storage untouched); declared
beside the stats route in the customers controller. Superadmin: an "Actividad
reciente" list on the Panel alongside the charts, reusing the timeline row idiom
(type icon, relative time, author), each row linking to its customer view. Work items
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
- [~] Tests: written in `test/customer-stats.test.ts` (delta-based assertions over fixed 2020-05/04 fixture months so reruns/parallel data never skew; covers bucketing, coalesce conversion, soft-delete exclusion, ordering, period boundaries, MTD default, role gates, bad month, and the recent feed incl. soft-deleted-customer exclusion) — **not yet run: live-Neon suite pends user sign-off**. NULL-source → `other` stays service-side only: the live column is NOT NULL with default, so the case can't be seeded.
- [x] `pnpm typecheck` green.

## CP-2 — Superadmin: CMS › Panel page

**Load the `superadmin-design` skill and the `dataviz` skill before building this page** (chart form, palette, and dashboard layout rules).

- [ ] `npm i chart.js` + PrimeNG `ChartModule` (`p-chart`) — confirm the PrimeNG 21 peer range; charts render client-side only, fine under zoneless.
- [ ] `data/dtos/customer-stats.ts` — response DTOs mirroring the endpoint shape (types out of component bodies).
- [ ] `app/services/http/customer-stats.service.ts` — `getIntake(month?)`; single-fetch page data, held in component signals (no NGXS state — nothing cross-page here).
- [ ] `cms/pages/dashboard/` — route `/cms/dashboard` in `cms.routes.ts` (no `pendingChangesGuard`; read-only page). Layout:
  - Header: h1 "Panel" + lede naming both period labels explicitly ("1–16 jul vs junio") so the MTD-vs-full-month comparison is honest.
  - Totals strip: leads and actives for the period with delta vs last month (plain figures, not a chart-junk duplicate).
  - Two grouped-bar charts (`p-chart type="bar"`): **Leads por canal** and **Activos por canal** — x = source (es_MX labels from a `model/constants/customer/source-labels.const.ts`, one constant per file), two series: current period vs previous month. Colors from brand theme tokens via the existing theme services (`app/services/theme/`), dark-mode aware (re-read CSS vars on theme change); axis/gridline styling per the dataviz pass.
  - Skeletons while loading; empty state when both periods are all-zero ("Aún no hay datos de captación — comparte tus enlaces de contacto", linking to `/customers/share-links`).
- [ ] "Actividad reciente" list (amendment 2026-07-20): recent-feed fetch beside `getIntake` in the same http service, timeline-row idiom reuse (type icon, relative time, author), rows link to the customer view; skeleton + empty state.
- [ ] `model/constants/access/nav-entries.const.ts` — CMS group children: prepend `{ label: 'Panel', route: '/cms/dashboard' }` before Home/Clientes.
- [ ] Build green (`ng build`); no screenshots unless asked.

## Verification

1. Backend: seed a few rows via `db:studio`/fixtures across sources, statuses, and two months → `curl -H "Authorization: Bearer <owner token>" 'localhost:8787/customers/stats/intake?month=2026-07'` → shape + counts match; technician token → 403.
2. Superadmin: owner login → CMS › Panel: totals + two charts with both series, correct period labels, dark-mode legible; convert a lead (PATCH status) → it moves from the leads bars to the actives bars of the current month; empty tenant shows the empty state.

## Risks / notes

- **MTD vs full previous month** biases deltas low early in the month — accepted; mitigated by explicit period labels, revisit if owners misread it.
- **Snapshot semantics**: conversions rewrite history (a June lead converting in July leaves June's lead count). Accepted for v1; immutable event history belongs to plan 08's interactions.
- `status_changed_at` only records the **latest** transition — re-activations overwrite; fine for this dashboard's definitions.
- chart.js + zoneless: instantiate via `p-chart` props and feed data through signals; avoid manual `Chart` instances so change detection stays out of the picture.
- Month bucketing in UTC vs tenant timezone — coarse but acceptable at monthly granularity; the tenant-level timezone field (manager push, backend plan §6) can refine it later.
