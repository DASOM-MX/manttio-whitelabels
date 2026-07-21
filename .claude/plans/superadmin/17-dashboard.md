# 17 — Dashboard (operations overview)

> **Status:** planned (doc)
> **Depends on:** 02 (shell, done) · 07/08 customers + CRM (done) · 06 reports (done) ·
> future modules (09/10/12/13) register cards here as they land
> **Owner:** worktree `superadmin-dashboard` · **Last updated:** 2026-07-20

**Supersedes 02 §4's "no separate module/plan" (decided 2026-07-20, owner directive).**
With 03–08 + the share-links/UTM pipeline shipped, the landing page graduates from
shell-owned stub to its own module: the tenant's operations overview. v1 focus is the
**acquisition funnel** — website contact form → share links + UTM attribution → leads →
CRM — because that's the loop the tenant can now see end-to-end, plus daily-ops summaries
from shipped modules only. The 02 decisions that stay binding: default landing route for
owner/admin/office, technicians never see it (they land on Calendar, or Reports without
`scheduling`), matrix row in `14-access-control.md` §2.

---

## 1. Scope & principles

- **v1 renders shipped data only** (customers/CRM 07/08, reports 06, share links).
  No placeholder cards for unbuilt modules — 09/10/12/13 register their cards from
  their own plans when they land (§3 reserves the slots; this plan owns the grid).
- **Read-only surface.** Every card deep-links into the owning module for action
  (list pages take their filters as GET params — use them); the dashboard itself
  never mutates. Exception already shipped: the header's share-links menu
  (copy-to-clipboard only).
- **Fixed time windows in v1** — no date-range picker: flow metrics (lead sources,
  campaigns) read **last 30 days**; "Reportes" reads the **current calendar month**;
  stock KPIs (active clients, open leads, overdue follow-ups) are point-in-time.
  Each card labels its window in the header micro-label.
- Roles: owner/admin/office see the same v1 dashboard — nothing financial exists on
  it yet. Revisit per-role card hiding when 09 puts money on the board (open decision).

## 2. Layout (v1)

Existing page scaffold survives (h1 "Panel" + share-links menu + `anim-stagger` grid);
the global empty state retires once the first cards land (per-card empty states replace it).

1. **KPI strip** — four stat tiles ahead of the cards grid (2×2 on mobile, 4-up ≥`md`):
   **Leads abiertos** · **Seguimientos vencidos** · **Clientes activos** ·
   **Reportes del mes**. `font-data` numerals, skeleton while loading, each tile links
   to the matching list view.
2. **Cards grid** (the shipped `md:grid-cols-2 xl:grid-cols-3`):
   - **Origen de leads** *(últimos 30 días)* — lead counts per `source`, CSS bar rows
     (label + count + proportional bar), descending. This is 08 §5's promised card —
     it ships here. Empty state → link to the share-links page.
   - **Campañas** *(últimos 30 días)* — top `utm_campaign` (+ its `utm_source`) pairs
     by lead count — the share-links payoff made visible. Empty state: "Comparte un
     enlace con UTM para medir tus campañas" → share-links page.
   - **Seguimientos** — customers with `nextFollowUpAt` due: overdue first (red pill,
     same rule as the leads view), then upcoming, capped at ~7 rows → each row links
     to the customer view; footer link to the leads list (already sorted by follow-up).
   - **Actividad reciente** — latest tenant-wide interactions (manual + system, newest
     first, ~8), reusing the timeline row idiom (type icon, relative time, author,
     muted system entries) → row links to the customer view.
   - **Reportes** *(mes en curso)* — count per report status (`created / in-progress /
     finished / mailed`) as status pills + count, footer link to the reports list.

## 3. Card registry

This plan owns the grid; other modules add cards **from their own plans** by (a) adding
their data to `GET /dashboard/summary` (backend ask recorded in their plan), (b) shipping
a component under `dashboard/components/<card>/`, (c) adding a row here.

| Card | Data | Status |
|---|---|---|
| Origen de leads | leads per source, 30d | **v1 (this plan)** |
| Campañas | top UTM campaigns, 30d | **v1 (this plan)** |
| Seguimientos | follow-ups due | **v1 (this plan)** |
| Actividad reciente | latest interactions | **v1 (this plan)** |
| Reportes | report status counts, month | **v1 (this plan)** |
| Visitas de hoy | today's visits | reserved — 12 (02 §4's original slot) |
| Cobranza | unpaid/overdue bills | reserved — 09 |
| Stock bajo | low-stock alerts | reserved — 10 |
| Pólizas por vencer | expiring contracts | reserved — 13 |

## 4. Expected API surface

One authed aggregate read — a single round trip serves the whole page:

- `GET /dashboard/summary` — owner/admin/office (technicians 403). Backend
  `modules/dashboard/` (thin controller + service; aggregate queries in its own
  repository against existing tables — it owns no tables of its own).

```ts
DashboardSummary {
  kpis: {
    openLeads: number;            // status = lead
    overdueFollowUps: number;     // next_follow_up_at < now, status not disabled/blacklisted
    activeClients: number;        // status = active
    reportsThisMonth: number;
  };
  leadSources:    { source: CustomerSource; count: number }[];        // 30d, desc
  campaigns:      { campaign: string; source?: string; count: number }[]; // 30d, top 5
  followUps:      { customerId; name; nextFollowUpAt; status }[];     // soonest first, cap 7
  recentActivity: { id; customerId; customerName; type; body; createdAt; userName }[]; // newest 8
  reports:        { status: ReportStatus; count: number }[];          // current month
}
```

- **Resolves 08's open decision** (`GET /customers/stats/sources` v1 or later):
  **v1, folded into this summary** — the standalone endpoint is never built.
- All queries filter `deleted_at is null` per the fork rule; the existing
  `customers_status/source/utm_source/utm_campaign` partial indexes carry the
  aggregate reads.
- **Neon-direct in v1.** The summary is a natural `TenantCacheDO` projection later
  (08 §4.1 already lists source counts there) — backend's call when the DO lands;
  write-through hooks would be the customers/interactions/reports write paths.

## 5. Frontend structure

- `dashboard/pages/dashboard/` grows; each card is its own
  `dashboard/components/<card>/` component taking its slice of the summary as input.
- `DashboardState` (lazy `provideStates` on the dashboard route): `summary`,
  `loading`; action `LoadDashboardSummary`. `app/services/http/dashboard.service.ts`;
  DTOs in `app/data/dtos/dashboard.ts`.
- **No chart library in v1** — CSS bar rows + `font-data` numerals cover the source
  and campaign cards (each bar pairs with its visible count — never color alone).
  A sparkline/chart dependency is an open decision deferred until 09 likely forces it;
  anything adopted must satisfy 01's single-hue-fill rule.
- Skeleton loaders per card region while the summary loads (no spinners); per-card
  empty states (Lucide icon + one sentence + action link).
- Reuses shipped pieces: relative-time pipe, interaction type labels/icons,
  status/source label constants under `model/constants/`, status pills.
- Mobile: KPI strip 2×2, cards stack single-column; no page-level horizontal scroll.

---

## Checkpoints

### CP-1 — Data path + KPI strip
- [ ] `DashboardSummary` DTO + `dashboard.service` + `DashboardState`
      (`LoadDashboardSummary`), mock-backed until the backend endpoint lands
- [ ] KPI strip: four tiles, `font-data`, skeletons, links into list views,
      dark-mode variants

### CP-2 — Funnel cards
- [ ] Origen de leads (bar rows, 30d, empty state → share-links page)
- [ ] Campañas (top UTM pairs, empty state copy per §2)
- [ ] Seguimientos (overdue-first list, red overdue pills, customer links)

### CP-3 — Ops cards + retire the stub
- [ ] Actividad reciente (timeline row reuse, customer links)
- [ ] Reportes (status pill counts, month window)
- [ ] Global "Aún no hay tarjetas" empty state removed; per-card empty states in
- [ ] Card registry (§3) + progress board updated

### CP-4 — Verification
- [ ] Headless Playwright pass vs mock backend (loaded, per-card empty, overdue
      pill, deep links carry list filters)
- [ ] A11y sweep: cards as `section[aria-labelledby]`, bar values readable as text,
      keyboard walk
- [ ] Build green; board + backend plan checklist updated

## Open decisions / asks

- Backend: aggregate SQL shape (own repository vs reaching into customers/reports
  repositories) — backend agent's call; the module owns no tables either way.
- `TenantCacheDO` caching of the summary: later, with the DO itself (§4).
- Per-role card visibility (office vs owner) — revisit when 09 adds financial cards.
- Date-range picker / custom windows — only on real tenant ask; v1 windows are fixed.
- Chart/sparkline library — deferred (§5); decide at 09.
- Ask to 06/08 (recorded here, built backend-side): none beyond the summary endpoint —
  no new frontend surface owed by those modules.
