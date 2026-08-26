# 23 — Visual language v2: bright console (light nav, accent-carried data)

> **Status:** planned 2026-08-26 — not started
> **Owner:** planning session 2026-08-26 · **Last updated:** 2026-08-26
> **Scope:** `superadmin/` only. **Depends on 22 CP-2** — every surface this plan writes must
> be authored on `primary`/`accent`/fixed-`surface`, never on names 22 is about to change
> (the same reasoning that front-ran 16 PR-2 for the 2026-07-21 shell redesign).
> **Relationship to 17:** an **evolution, not a replacement.** Plan 17's soft-executive
> skeleton stands — preset-first chrome, breathable page rhythm, `page-header` on every route,
> `rounded-control` buttons, neutral shadows, no colored glows, compact data inside airy
> chrome. Three of its decisions are **superseded** here (§ Supersessions).
> **Reference:** the two dashboard screenshots supplied by the owner 2026-08-26 (light SaaS
> console — "Shopeers"), committed as **`assets/23-reference-dashboard.png`** (both
> attachments were the same image). It is also described exhaustively in § The reference,
> so this plan survives without opening the file.
> **Not in scope (owner, 2026-08-26):** widget composition — the reference's "Add Widget"
> panel, drag-and-drop placement, and per-user saved layouts. Visual language + the shared viz
> kit only; no new backend persistence.

## Problem

1. **The nav fights the content.** Plan 17 CP-2 landed a dark brand panel (`primary-1000`,
   `rounded-r-shell`, light-on-dark rows, solid `primary-600` active row). It reads as a
   product from a different era than the white cards beside it, it burns the tenant's brand
   hue on furniture rather than on data, and in dark mode the panel and canvas collapse toward
   the same value.
2. **Every data cue is one hue.** With only `primary` available, categorical comparisons are
   tints of the same color (17's `primary-400` accent step, the single-hue bar idiom). 22 adds
   a real accent; nothing in the app uses it yet.
3. **The dashboard vocabulary is ad-hoc.** The CRM cockpit hand-rolls its KPI strip, bars, and
   trend card. The next dashboard (billing, WMS, orders) will hand-roll them again, slightly
   differently.

## The reference (read this before touching anything)

![The owner's reference dashboard: light canvas, white sidebar, KPI strip, trend and gauge cards, and the right-side widget panel](assets/23-reference-dashboard.png)

Two screenshots of the same light dashboard; the first also shows an overlay panel over a
dimmed canvas. What matters, surface by surface:

**Canvas + frame.** Near-white cool page background; the whole app sits inside a subtly
rounded outer frame with generous outer margin. Cards are pure white, ~16px radius,
**hairline border plus a very light shadow** — the border does the separating, the shadow only
lifts. Card padding is comfortable; the data inside stays compact.

**Sidebar — light, ~240px.** White panel, hairline right border, no rounded shell edge.
Wordmark + mark at the top on the same strip height as the topbar. Flat rows: icon + label,
generous row height, `rounded-control`. **Active row = soft tinted fill with primary icon +
label** (not a solid primary block). A count badge sits right-aligned on rows that carry one
(e.g. Orders · 46) as a small soft pill. One group ("Finances") is a collapsible section with a
chevron and indented, icon-less children. A separated block at the bottom holds Settings +
Help & Support, then a dark promotional card (title, one line of copy, full-width CTA button).

**Topbar — surfaceless.** Left: a wide search field with a leading magnifier, placeholder, and
a `⌘K` hint chip. Right: theme toggle (sun), notification bell, avatar. No background, no
shadow — it floats on the canvas.

**Page header.** `Dashboard` as a plain title on the left; on the right a row of controls —
a date-range chip (calendar icon + range), a period select ("Last 30 days"), a ghost
"Add widget" button, and a solid primary "Export" button with a leading icon.

**KPI strip — four equal tiles.** Each: micro-label + a small trailing icon, a large tabular
numeral, a delta pill beside it (green ↑ / red ↓ with a signed percentage), and a muted
comparison caption underneath ("vs. 14,553 last period").

**Cards.**
- *Total Profit* — big numeral + delta + caption, then a line chart with a faint y-grid, a
  vertical marker on hover, and a floating tooltip card (date + two labeled values).
- *Customers* — a **segmented bar**: three touching segments in three hues (primary / green /
  orange), each with its own count and label underneath and a colored rule on top.
- *Most Day Active* — a bar chart where **one bar is primary and the rest are neutral**, with
  the peak value labeled above the highlighted bar.
- *Repeat Customer Rate* — a **segmented semicircular gauge** (many small ticks, filled in
  green up to 68%), the percentage large in the center, a caption below ("On track for 80%
  target"), and a text link ("Show details").
- *Best Selling Products* — a table: ID · NAME with a square product thumbnail · SOLD ·
  REVENUE rendered in green/red with a small directional icon · RATING as a star + value.
- *AI Assistant* — a decorative gradient sphere over a prompt input with a circular send button.
- Cards that have actions carry a `…` overflow control on the header's trailing edge.

**Overlay panel (first screenshot).** A right-side panel over a dimmed canvas: title + close,
then a scrolling list of option cards — thumbnail preview on the left, title + two-line
description, a `#hashtag` tag chip, and a small solid pill "Select" button on the trailing
edge. One card is shown lifted mid-drag with a shadow, and a small floating stat card follows
the cursor. *(Only the panel/card/tag/scrim styling is in scope — the drag-and-drop feature is
explicitly not.)*

**Color logic.** Primary blue on: active nav, primary buttons, the highlighted bar, the hero
line series, links. Green/red/orange appear as **status and categorical** cues (deltas,
revenue direction, gauge fill, segment mix) — a fixed semantic set, not brand-derived.

## Direction (canonical) — "bright console"

Soft-executive's rhythm, re-lit: **white nav, hairline-bordered cards, and data that finally
has two brand colors plus a fixed status set to speak with.**

1. **Light shell.** Sidebar is a `surface-0` panel with a hairline right border (dark:
   `surface-900` panel, `surface-800` border) — the brand panel and `rounded-r-shell` retire.
   Active row = `primary-50`-equivalent tint (`bg-primary-100/60` light, `bg-primary-1000/40`
   dark) with `text-primary-700`/`primary-300` label + icon; hover = neutral tint; the
   collapsed rail and its flyouts inherit the same treatment. The floating collapse handle
   stays. Topbar stays surfaceless (17).
2. **Card treatment (supersedes 17's shadow-only cards).** `.card` = white, `rounded-card`,
   **hairline `surface-200` border + the existing soft `shadow-card`**, `p-6`. Borders come
   back as the primary separator; the shadow drops to a lift. Dark mode: `surface-900` fill,
   `surface-800` border, deepened shadow.
3. **Palette roles (the point of 22).**
   - `primary` — interactive + identity: buttons, links, active nav, focus, hero chart series,
     the highlighted bar.
   - `accent` — the second brand voice: secondary chart series, the second segment of a
     segmented bar, informational badges, gauge fill *when the metric is neutral rather than
     good/bad*, decorative chips. **Never** the sole carrier of a status meaning.
   - Fixed semantic set (unchanged, already documented in the brand editor's callout):
     emerald = positive/up, red = negative/down, amber = warning/pending. Deltas, revenue
     direction, and any good/bad gauge ride these — never `primary`/`accent`, so a tenant's
     brand can never make "down" look green.
   - 17's "**`primary-400` is the decorative accent**" rule is retired — that role is `accent`.
4. **Density.** 17's page rhythm holds (`p-6` cards, `gap-5`/`gap-6`, gutters
   `px-4 sm:px-6 md:px-8` + `py-6`, `h-14` strips, `py-2.5` table cells). KPI tiles are the one
   tighter unit: `p-5`, label → value → caption stacked with no extra air.
5. **Shape + type unchanged:** `rounded-card` / `rounded-chip` / `rounded-control` /
   `rounded-full` boundary, Figtree, `font-data` for every numeral, weight ladder capped at 500
   outside sanctioned emphasis, no arbitrary bracket values, no emojis, Lucide stroke-2.
6. **Dark mode is a first-class pass, not a follow-up** — every CP closes with both modes
   eyeballed and the contrast checks in § Verification run.

## Supersessions (17 + 01)

| Superseded | By |
|---|---|
| 17 CP-2 dark brand-panel sidebar (`primary-1000`, `rounded-r-shell`, solid `primary-600` active row) | § Direction 1 — light panel, tinted active row |
| 17 "hairline borders retire to internal dividers; cards are shadow-only" | § Direction 2 — hairline border **and** soft shadow |
| 01 § Design language "Accent step: `primary-400` is the decorative accent" | § Direction 3 — `accent` scale (22) |

Everything else in 17 and 01 stands. Both documents are edited **in CP-1**, together with the
committed `.claude/skills/superadmin-design` mirror (same commit — 01's standing rule).

## The viz kit (CP-3)

New shared components under `superadmin/src/app/shared/components/`, each a standalone signal
component with typed inputs, no inline function calls in templates, constants in
`model/constants/<entity>/`, no barrels:

| Component | Owns |
|---|---|
| `kpi-tile` | micro-label, trailing Lucide icon, `font-data` value, delta pill (sign always shown, emerald/red, arrow icon), muted comparison caption. Loading state = `.skeleton` bars (17 CP-3 idiom). |
| `segmented-bar` | n proportional touching segments with per-segment color role, count, label, and top rule; degrades to a single neutral bar at n = 1 and to a track when total = 0. |
| `gauge-card` | segmented semicircular arc, percentage centerpiece, caption, optional footer link; `role="img"` + `aria-label` carrying the value, reduced-motion-safe sweep. |
| `trend-card` | hero numeral + delta + caption over a `p-chart type="line"` in the fixed-height wrapper (`h-64`, host + inner `h-full` — the PrimeNG 21 `styleClass` gotcha), faint y-grid, no point dots, `tension: 0.4`, legend off, custom tooltip card, colors re-read from the brand CSS vars on theme change. |

**Table idioms** (not components — documented in 01 and applied where they fit): leading square
thumbnail cell, directional colored numeric cell (emerald/red + arrow), star + value rating cell.

Every component is used by CP-4 in real pages; nothing ships unused (the `.icon-chip--soft`
lesson from 17 CP-5).

## Checkpoints

One PR per checkpoint, stacked, base `main`, prefix `style(superadmin)` except CP-3
(`feat(superadmin)`). **CP-1 cannot start before 22 CP-2 merges.** `npm run build` green closes
every CP, and **no screenshots unless the owner asks** — the owner watches `:4200`.

### CP-1 — Language + tokens
- [ ] 01-conventions § Design language rewritten onto § Direction: light shell, bordered cards,
      the three-way palette-role split, `accent` in place of the `primary-400` step
- [ ] `.claude/skills/superadmin-design` mirror updated **in the same commit** (01's standing rule)
- [ ] § Supersessions reflected in 17's header (done at plan time — re-verify)
- [ ] `.card` / `.card-section` in `styles.scss`: hairline `surface-200` border + the existing
      `shadow-card`; dark mode `surface-900` fill, `surface-800` border, deepened shadow
- [ ] Preset tokens re-checked against the new card treatment (content/overlay borders) —
      preset-first, no new override sheet for looks
- [ ] Fixed-neutral retune decided (22 § Target 3): keep today's neutral or cool the canvas —
      if cooled, one edit in each of the four configs, zero tenant impact
- [ ] Outer app-frame decision recorded (§ Open ③)
- [ ] Both modes eyeballed; `npm run build` green

### CP-2 — Shell
- [ ] Sidebar → `surface-0` panel with a hairline right border; the `primary-1000` panel and
      `rounded-r-shell` retire (drop the `shell` radius token if nothing else uses it)
- [ ] Rows: neutral hover; active = `bg-primary-100/60` (dark `bg-primary-1000/40`) with
      `text-primary-700` / `primary-300` label **and** icon; `aria-current` preserved
- [ ] Wordmark strip stays `h-14` and level with the topbar; group collapse chevron + indented,
      icon-less children
- [ ] Count-badge slot on nav entries (soft pill, right-aligned) — wired to a real count or left
      out; no decorative placeholder
- [ ] Collapsed rail + hover/focus flyouts inherit the light treatment; flyout overflow
      behaviour unchanged; the floating collapse handle survives
- [ ] Bottom block: Settings/Help separation + the promo-card decision (§ Open ②)
- [ ] Topbar stays surfaceless; search-field decision (§ Open ①) recorded either way
- [ ] Focus rings visible on the tinted rows; § Verification contrast checks pass in both modes
- [ ] `npm run build` green

### CP-3 — Viz kit
- [ ] `kpi-tile` — micro-label, trailing Lucide icon, `font-data` value, delta pill (sign always
      shown, emerald/red, arrow), muted comparison caption, `.skeleton` loading state (17 CP-3)
- [ ] `segmented-bar` — n proportional touching segments with per-segment color role, count,
      label, top rule; degrades to a single neutral bar at n = 1 and to a bare track at total = 0
- [ ] `gauge-card` — segmented semicircular arc, percentage centerpiece, caption, optional footer
      link, `role="img"` + `aria-label` carrying the value, reduced-motion-safe sweep
- [ ] `trend-card` — `p-chart type="line"` in the `h-64` wrapper with host + inner `h-full`
      (the PrimeNG 21 `styleClass` gotcha), faint y-grid, no point dots, `tension: 0.4`, legend
      off, custom tooltip card, colors re-read from the brand vars on theme change
- [ ] Table idioms documented in 01: thumbnail lead cell, directional colored numeric,
      star + value rating
- [ ] House rules hold: constants in `model/constants/<entity>/`, enums in `model/enums/`,
      no barrels, no inline function calls in templates, no arbitrary `[Npx]` values,
      Lucide stroke-2, no emojis
- [ ] Every component is consumed by CP-4 — anything unused is cut, not shipped
      (the `.icon-chip--soft` lesson from 17 CP-5)
- [ ] `npm run build` green

### CP-4 — Dashboards
- [ ] CRM cockpit KPI strip → `kpi-tile`; its hand-rolled copies deleted
- [ ] Channel-mix bars → `segmented-bar`; the six-month trend → `trend-card`
- [ ] A `gauge-card` lands on a real rate metric (conversión / follow-up compliance) — or the
      component is cut per CP-3's last item
- [ ] Any other dashboard surface that exists when this CP starts
- [ ] Chart colors verified across a theme toggle (var re-read), both modes
- [ ] `npm run build` green

### CP-5 — Lists + tables
- [ ] The five list pages: header treatment, thumbnail/avatar lead cells, directional colored
      numerics where a value has a direction
- [ ] Status pills re-checked against the palette-role split; **role pills stay the static blue
      ladder** (14 §1 / 16 § Mechanics 3) — not brand-shifting, not accent
- [ ] `p-table` density unchanged (`py-2.5` cells, 13–14px text); skeleton `#loadingbody` rows
      and `.empty-icon` empties kept (17 CP-3)
- [ ] Filters-popover + paginator touched only where the border treatment demands it
- [ ] `npm run build` green

### CP-6 — Forms, dialogs, detail views + sweep
- [ ] Editors, drawers and dialogs onto the bordered-card treatment; the reference's overlay
      panel — scrim, option card (thumbnail + title + description + tag chip + trailing pill
      action) — lands as shared idioms
- [ ] Detail views re-checked: client 360, equipment, report view
- [ ] Straggler audit: arbitrary bracket values → 0; weight ladder ≤ 500 outside the sanctioned
      emphasis list; leftover decorative `primary-400` → `accent`
- [ ] Full § Verification pass — contrast in both modes, reduced motion, keyboard
- [ ] `npm run build` green

## Verification

- **Contrast (CRITICAL, 01 § Accessibility):** the tinted active nav row, accent-on-white,
  accent-on-`surface-900`, delta pills, and the gauge arc each clear WCAG AA (4.5:1 text,
  3:1 non-text) in **both** modes, measured against the *neutral default* brand — a tenant's
  hue must not be what saves it.
- `grep -rE '\[[0-9]+(px|rem)\]' superadmin/src` → 0 (no arbitrary values).
- No colored shadows/glows anywhere; shadows stay neutral black alpha.
- `prefers-reduced-motion` collapses the gauge sweep, chart animations, and row transitions.
- Keyboard: nav group collapse, card overflow menus, and the search field are reachable and
  escapable; `aria-current` on the active nav row.

## Decisions

- **Locked (2026-08-26, owner):** adopt the **light sidebar** (supersedes 17's dark brand
  panel) · scope = visual language **+ the shared viz kit**, no widget composition, no
  per-user dashboard layouts · superadmin only.
- **Derived (2026-08-26, planning):** cards regain a hairline border · `accent` never carries
  a status meaning alone · 17's `primary-400` accent step retires · the viz kit ships only
  what CP-4 actually uses.
- **Open — decide at the CP that needs it:** ① **topbar global search** — the reference's
  headline affordance, but superadmin has no cross-module search today: build it (its own
  plan), stub it visually, or leave the topbar as-is (CP-2). *Recommendation:* leave it out
  until there is something to search; a decorative search box is a lie. ② The sidebar's
  **bottom promo card** — what goes there in a tenant admin (support link? plan/usage? nothing)?
  (CP-2). ③ The **outer rounded app frame** — adopt the inset frame or keep the current
  edge-to-edge shell (CP-1). ④ Whether the gauge's default fill is `accent` or emerald when the
  metric has no good/bad direction (CP-3).
