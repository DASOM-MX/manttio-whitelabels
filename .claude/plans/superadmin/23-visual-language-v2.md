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
> console — "Shopeers"). They are described exhaustively in § The reference so this plan
> survives without them; ask the owner to commit the PNGs under
> `.claude/plans/superadmin/assets/` if a pixel reference is wanted.
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

Each CP is one stacked PR, base `main`, prefix `style(superadmin)` (CP-3 is `feat(superadmin)`).
`npm run build` green closes every CP; **no screenshots unless the owner asks** (the owner
watches `:4200`).

- **CP-1 — language + tokens.** 01-conventions § Design language rewrite + the
  `superadmin-design` skill mirror (same commit) + this file's supersession table; `.card`
  border treatment in `styles.scss`; preset tokens for the accent-aware chrome; the fixed
  neutral retune decision from 22 § Target 3 (cool the canvas or keep it).
- **CP-2 — shell.** Sidebar → light panel (rows, active tint, hover, group collapse, count
  badges, collapsed rail + flyouts, bottom block); topbar search field + `⌘K` affordance
  *(see § Open)*; both modes; a11y (focus rings on the tinted rows, `aria-current`).
- **CP-3 — viz kit.** The four components above + the table idioms, with the loading and empty
  states each one needs.
- **CP-4 — dashboards.** CRM cockpit onto the kit (it currently hand-rolls all four), plus any
  other dashboard surface that exists when the CP starts.
- **CP-5 — lists + tables.** The five list pages: header treatment, thumbnail/avatar lead cells,
  directional numerics, status pills re-checked against the accent role, `p-table` density
  unchanged.
- **CP-6 — forms, dialogs, detail views + sweep.** Editors/drawers/dialog panels onto the
  bordered-card treatment (the reference's overlay panel + option-card + tag chip styling lands
  here); app-wide straggler audit (bracket values, weight ladder, leftover `primary-400`
  decorative uses); full contrast pass.

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
