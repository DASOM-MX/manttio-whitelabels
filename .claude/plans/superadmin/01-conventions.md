# 01 — Conventions: styling + component writing style

> **Status:** done (doc — the porting *tasks* live in `02-app-shell.md` CP-2)
> **Owner:** — · **Last updated:** 2026-07-05

These rules are ported from `frontend/CLAUDE.md` and are **binding for every superadmin
module agent**. Where the two apps diverge, this file wins for `superadmin/`. Read this
before writing any component.

---

## Typography (decided 2026-07-05 · typeface revised 2026-07-22)

- **Superadmin's typeface is Figtree** (variable; owner 2026-07-22, plan 17 —
  supersedes Nunito Sans, which superseded Quicksand/Commissioner the same day:
  geometric-clean with a touch of warmth for the executive turn).
  This is a **deliberate deviation from frontend
  parity**: the superadmin is *our* product chrome, constant across tenants, and its
  own voice tells tenants who they're working with. Tenant-facing surfaces
  (`website/` + `frontend/` field app) are **brand-font-driven** instead:
  `Brand.font { body, heading? }` from the curated variable-font catalog
  (`03-branding.md` §2.1), defaulting to the business-identity pair **Work Sans
  (body) + Rubik (headings)** — the field app migrates off Inter to the brand-font
  CSS vars (recorded as a fork `frontend/` task, not superadmin work).
- **Self-hosted, never CDN:** `@fontsource-variable/figtree` — one woff2.
  No `fonts.googleapis.com` import (offline, CSP, no FOUT) — paste-in embed
  snippets get translated to the fontsource equivalent.
- Stacks in `tailwind.config.js`:
  `sans: ['"Figtree Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif']`,
  plus a `data` stack for numeric table/money columns. Weights: **600 body ·
  700 labels/buttons/headings**, 800+ for the wordmark and rare emphasis (owner
  2026-08-27, "font weights are off, use 200 more points" — every rung of the
  2026-07-22 400/500 ladder moved up 200; that turn's reasoning still holds
  *within* the ladder, size + tracking still carry hierarchy and no active state
  bumps weight, the whole thing just sits two steps heavier). The 600 baseline is
  set once on `body`, so anything that states no weight inherits it — utilities
  are written only where a rung differs. Both faces are variable (Figtree
  300–900, Work Sans 100–900), so every rung is a real face and nothing is ever
  synthesized or snapped.
- **Numeric/data face: Work Sans Variable** (`@fontsource-variable/work-sans`,
  owner 2026-08-27 — supersedes Atkinson Hyperlegible). Two reasons: it follows
  the weight ladder (Atkinson shipped only 400 and 700, so every rung ≥ 600
  snapped to Bold), and it sits beside Figtree as a quiet grotesque rather than
  Atkinson's high-legibility letterforms, which read as a different product
  inside the same cell.
- **Tabular numerals:** data cells set `font-feature-settings: 'tnum'`.
  **Verify the face before adopting it, never trust the feature list** — the
  2026-07-06 finding stands as method: Commissioner *declared* `tnum` and it was
  a no-op. Work Sans was checked both ways before the swap: its `tnum` maps every
  digit to a `.tf` glyph at a uniform 604/1000 advance, and in-browser every digit
  measures 80px per 10 at both 600 and 700 (proportional — 90/60/80… — with the
  feature off, so the feature is what does the work).
  **Correction (2026-08-27):** the old line generalized Commissioner's failure into
  "the product voice's tnum can't be trusted". Figtree's is real (uniform 620/1000),
  so that rationale expired when Figtree replaced Commissioner on 2026-07-22. A
  separate numeric face is now a **design** choice — data should read in its own
  voice — not a workaround for a broken feature.
- PrimeNG inherits the body font — no per-component font overrides.

## Design language — bright console (decided 2026-07-05 · identity revised 2026-07-22 plan 17 · re-lit 2026-08-27 plan 23)

The superadmin reads as a clean, breathable **business console** (PrimeNG Diamond
reference; supersedes the field-app-derived "solid & tight" operations-console
identity — this app serves office/executive users, not sunlight-and-gloves field
techs; WCAG contrast rules are untouched). Confidence comes from stock Aura chrome,
generous page-level rhythm, hairline-bordered cards, strong status cues, and restrained
motion — never decoration.

**Re-lit at plan 23 ("bright console", owner 2026-08-26):** plan 17's soft-executive
skeleton stands — preset-first chrome, breathable page rhythm, `page-header` on every
route, `rounded-control` buttons, neutral shadows, compact data inside airy chrome.
What changed is the light: the shell goes **light** (the dark brand panel retires), cards
regain a **hairline border** under the shadow, and data finally speaks with **two brand
colors plus a fixed status set** instead of tints of one hue. Three of 17's decisions are
superseded — each is marked below. The committed skill
**`.claude/skills/superadmin-design`** mirrors this section so every module agent
auto-loads it — **edit both in the same commit.**

- **Component chrome is preset-first (owner 2026-07-22, plan 17):** PrimeNG renders
  **stock Aura**, customized only through `ManttioPreset` design tokens
  (`app/theme/manttio-preset.ts`) — a value we would have put in an override sheet
  goes in a token whenever Aura exposes one. See the PrimeNG section for the
  surviving-sheet rules.
- **Density (breathable — plan 17, supersedes the soft-UI turn's `p-5`):** cards
  `p-6`; section gaps `gap-5`/`gap-6`; page gutters `px-4 sm:px-6 md:px-8` with
  `py-6` (shell-owned, CP-2); topbar + sidebar header strips `h-14` (slimmed from
  `h-16`, owner 2026-07-22) and level, so the topbar's hairline bottom rule runs
  unbroken across both; tables stay compact
  (`py-2.5` cells, 13–14px text). Airy chrome, dense data — the air lives at the
  page level, never inside the data.
- **Page-header pattern (plan 17 §5, CP-2):** every routed page opens with the
  shared `shared/components/page-header` (`app-page-header`) — the page's single
  `h1` (`text-2xl font-bold tracking-tight` — 700 since the +200 weight-ladder turn),
  optional muted description,
  optional `backLink`/`backLabel` (detail/form pages), a `meta` slot for status
  tags beside the title, and the default slot for right-aligned actions (the
  filters-popover trigger stays left of the primary action). The component owns
  the `mb-6` under-header rhythm — pages never hand-roll an `<h1>` row.
  Title-only by default: no breadcrumbs (the two-level nav already locates you;
  owner may opt in later). Dynamic titles/descriptions bind computeds or signal
  ternaries, never method calls.
- **Bordered elevation (owner 2026-08-27, plan 23 CP-1 — supersedes plan 17's
  shadow-only cards, which superseded borders-not-shadows):** cards are white
  `rounded-card` surfaces on the tinted page background carrying **both** a hairline
  `surface-200` border and the soft neutral `shadow-card` (`.card`/`.card-section`;
  dark = `surface-900` fill, `surface-800` border, deepened `.app-dark` shadow). The
  border does the separating, the shadow only lifts — on a near-white canvas a shadow
  alone stops reading. A standalone `p-table` **is** a card and carries the same
  treatment (`theme/table.scss`); inside a padded card `.card-flush-table` sheds all of
  it, border included. Nested grouping inside a card is still a background shift
  (`bg-surface-100 dark:bg-surface-800/40`) or an internal divider — never a second
  bordered box. PrimeNG panels draw the same hairline without an override sheet: stock
  Aura's content/overlay border already resolves to `{surface.200}` in light, and the
  preset pulls dark from Aura's `{surface.700}` down to `{surface.800}` to match
  (`manttio-preset.ts` — preset-first, plan 23 CP-1). The shell follows the same
  rule since 23 CP-2: `.shell-sidebar` dropped its 2026-07-21 shadow for a hairline
  right border, because a shadow between two near-white surfaces separates nothing.
  **The topbar is SECTIONED** (owner 2026-08-27, 23 CP-2 — supersedes the 2026-07-22
  surfaceless strip): a `surface-0` bar with a hairline bottom rule, continuous with the
  sidebar panel, so the chrome reads as one white L against the content well. The vertical
  seam between the wordmark and the search is the sidebar's own `border-r` — never a rule
  of its own. Trailing edge = **three separate circles, each with a 2px border**
  (`.topbar-action`, `size-8` — 32px, owner 2026-08-27, with `size-4` icons; `gap-2`:
  theme · bell · account) — never a shared pill; the
  account one is `.topbar-avatar`, brand-tinted, and carries no name or chevron (the popover
  states name + email + role; `aria-label`/`title` carry the name). The stroke is
  `border-2`, **not `ring-2`** (owner 2026-08-27): a border sits inside the box, so the
  row's `gap-2` stays a true 8px between edges instead of the 4px a ring's outward spread
  would leave. The search is a **filled, borderless** pill — on a white bar the fill states
  the field and a border there would compete with the action circles. **`.topbar-search` is a deliberately `disabled` stub** (owner 2026-08-27,
  23 § Open ①): the chrome ships now, the capability is **plan 24** — do not quietly
  enable it, and do not treat the `⌘K` hint as a live binding until 24 CP-2 lands. The chip
  itself **stays** (owner 2026-08-27) — it is part of the affordance the stub previews, and
  a `disabled` control cannot swallow the keystroke it advertises.
  Shadows are always **neutral black alpha** — colored glows stay banned (AI-slop rule).
  **Depth needs contrast:** superadmin's `background` alias repoints to `surface-100`
  (one step under the card whites; owner 2026-07-22) — a deliberate superadmin-only
  divergence from plan 16's shared `surface-0` value, or the elevation never reads.
  **The shell stays edge-to-edge** (owner 2026-08-27, plan 23 § Open ③ — the reference's
  inset rounded app frame is *not* adopted): full-width main since 2026-07-21, breathing
  room comes from gutters and rhythm, never from a boxed canvas.
- **The chrome neutral is fixed, and slightly cool (plan 22 § Target; cooled at 23 CP-1,
  owner 2026-08-27):** `surface-*` reads no CSS variable and no tenant retunes it —
  literal `hsl(240 5% L%)` across the 11 steps, mirrored in `tailwind.config.js` and
  `manttio-preset.ts` (both build it from one lightness table, so they cannot drift).
  Only hue and saturation moved on 2026-08-27 — the lightness ladder, and therefore
  every contrast ratio in the app, is exactly where it was. `surface-*` is
  **superadmin's alone**: the field app and the website deleted their copies on
  2026-08-27 and take stock Tailwind `zinc` for chrome, so neutral classes no longer
  port between the apps — only `primary-*`/`accent-*` do.
- **Entity rows lead with an initials avatar** (`size-9 rounded-full bg-primary-100
  text-primary-800` + the `initials` pipe, dark `primary-1000/60`/`primary-300`) —
  the reference's row identity, brand-tinted (canon: customers-list Cliente column).
- **Palette roles (plan 23 § Direction 3, decided 2026-08-27 — supersedes the
  2026-07-22 "accent step" and closes plan 22's open question):** three voices, and they
  never trade places.
  - **`primary`** — interactive + identity: buttons, links, focus rings, the active nav
    row, the hero chart series, the one highlighted bar in a comparison.
  - **`accent`** (a real tenant-configured scale, DEFAULT `accent-500` — not a step of
    primary): the second brand voice — secondary chart series, the second segment of a
    segmented bar, informational badges, decorative chips (the `kpi-tile`'s trailing
    glyph), and a gauge fill *when the metric is neutral rather than good/bad* — which
    is `gauge-card`'s default tone, settled at 23 CP-3. **Never the sole carrier of a
    status meaning.**
  - **A fixed semantic set**, not brand-derived: emerald = positive/up, red =
    negative/down, amber = warning/pending. Deltas, revenue direction and any good/bad
    gauge ride these — so a tenant's hue can never make "down" look green.

  `primary-400`-as-decorative-accent is **retired**; that role is `accent`. Interactive
  solids stay `primary-600`/`700` — white text on 400 never cleared 4.5:1. The straggler
  sweep (`.icon-chip` — the unused `--soft` variant was removed at plan 17 CP-5 —
  progress bars, highlight numbers) lands at **23 CP-6**; until that PR those surfaces
  still read `primary-400`, and the doc is the target, not the inventory.
  **A tenant that has never set `accent` renders it as the neutral fallback ramp**
  (branding rule 3 — no invented hue), so accent-carried surfaces read gray there until
  the brand is filled in; that is correct behavior, not a regression.
- **Stat cards (reference idiom):** micro-label + trailing Lucide icon, `font-data`
  value, a delta pill beside it (emerald/red per the fixed semantic set, arrow icon,
  **sign always shown**) and a muted comparison caption underneath ("vs. 14,553 el
  periodo anterior"). Tiles are the one unit tighter than the page rhythm: `p-5`, label →
  value → caption stacked with no extra air. `kpi-tile` (23 CP-3) owns all of it —
  including the `.skeleton` loading state; timelines pair small accent icons with
  micro-label timestamps.
- **Data-viz (owner 2026-07-22, CRM-cockpit turn — supersedes utm-params 03's
  2026-07-20 pies; re-coloured by plan 23's palette roles, 2026-08-27):** time series
  are `p-chart type="line"` — hero series `primary-600` (dark `primary-400`) with the
  sole tolerated gradient (a single-hue area fill of the hero colour fading to
  transparent), **secondary series `accent-500`** (superseding the old neutral-end
  `primary-1000`/`primary-100` trick, which existed only because there was no second
  brand colour), smooth `tension: 0.4`, no point dots, faint y-grid only, chart.js
  legend OFF — the legend is dot chips in the card header. Categorical mixes (channels,
  sources) are **never pies**: proportional bars on a `surface-100`/`surface-800`
  track, width relative to the top row, `font-data` counts, a muted split line beneath
  — the mix reads `primary` → `accent` → neutral, and where one member is *the* answer
  (a peak day, a top channel) that bar alone is `primary-600` and the rest are neutral.
  Good/bad numbers never take a brand colour: they ride the fixed semantic set. Chart
  canvases live in a fixed-height wrapper (`h-64`) with host + inner div `h-full`
  (PrimeNG 21 ignores `styleClass` on `p-chart`); chart colors re-read the brand CSS
  vars on theme change (canon: `crm/pages/dashboard`). The shared components that
  package all of this — `kpi-tile`, `segmented-bar`, `gauge-card`, `trend-card` —
  **shipped 2026-08-27 at 23 CP-3** under `shared/components/`; hand-rolling a fifth
  copy of a KPI strip after that is a review failure.
  - **They take a `VizTone`, never a class** (`model/enums/viz/viz-tone.enum.ts`):
    `Brand`/`Accent` are the two tenant voices, `Positive`/`Negative`/`Warning` the
    fixed set, `Neutral` the surface. Class maps live in `model/constants/viz/`, one
    per surface kind — a fill (`RULE_*`), an SVG stroke (`STROKE_*`), a numeral
    (`VALUE_*`), a pill (`DELTA_*`) — because one tone needs different steps at 3:1
    and at 4.5:1.
  - **Values arrive formatted.** The kit prints the strings it is given; currency,
    percent points and locale separators stay the call site's business.
  - The view-model math is pure and specced (`services/viz/*.ts`): segment shares and
    their narrow-member floor, the gauge's fill count, the delta pill's direction →
    tone reading. Canvas colours resolve through
    `services/theme/chart-palette.service.ts`, which reads `--brand-*` live and falls
    back to the neutral ramp baked into the Tailwind config; the floating tooltip card
    is `services/chart/chart-tooltip.service.ts` (chart.js's canvas tooltip is off —
    it can carry neither the card treatment nor `font-data`).
- **Table idioms (reference crops, documented at 23 CP-3):** three cell shapes the
  reference's *Best Selling Products* table draws. They stay idioms, not components — a
  `p-table` column is already the unit, and wrapping one buys a host box and nothing
  else. Use them where the data exists; none is mandatory.
  - **Thumbnail lead cell** — a `size-9 rounded-control` image (`object-cover`, over a
    `bg-surface-100` placeholder while it loads) on a flex row with the name. An entity
    that has no picture keeps the initials avatar (`size-9 rounded-full bg-primary-100`,
    the customers-list canon) — never an empty grey square.
  - **Directional numeric** — a numeric column whose value has a *direction* (revenue
    against last period, stock movement) reads `font-data tabular-nums` in the fixed
    semantic set with a `size-3` arrow ahead of it: emerald up, red down. A column with
    no direction stays neutral, which is most of them. Never brand-coloured.
  - **Rating cell** — one amber star glyph plus the value in `font-data` ("4,8"), not a
    row of five: five stars reads as a control you can set, and this is a reading.
- **Default-PrimeNG buttons (owner 2026-07-22: "blob-like buttons do not look
  clean" — supersedes the 2026-07-21 blob/pill buttons):** actions are
  `rounded-control` rectangles at the input radius, stock-Aura `px-4` — the
  `.btn` family carries it, paginator pages follow via `table.scss`, and any
  future `<p-button>` via the preset's button `borderRadius: {border.radius.lg}`
  token (plan 17 — the old button sheet is retired; dialog/drawer/toast close
  buttons render stock). **Ghost icon-only buttons in chrome (topbar
  bell/theme/menu, avatars) stay circles** — they read as chrome, not actions.
  Nav rows are flat `rounded-control` (Diamond turn, owner 2026-07-22).
  **Boundary (tokenized 2026-07-22, § Styling):** inputs/buttons/nav
  `rounded-control`, cards/dialogs `rounded-card`, icon chips + popovers
  `rounded-chip`, status/role pills + chrome icon-circles `rounded-full`.
- **Condensed button copy (owner 2026-07-22: "Guardar y aplicar is just too
  long"):** action labels are the bare verb wherever context disambiguates —
  "Guardar", not "Guardar cambios"/"Guardar borrador"/"Guardar y aplicar"
  (draft-vs-publish stays clear because "Publicar" sits alongside). Qualify
  only when two same-verb actions share a view.
- **Strong cues:** status pills wherever state exists (never color alone); active nav =
  **a soft tinted row on a light panel** (owner 2026-08-26, plan 23 § Direction 1 —
  supersedes the 2026-07-22 dark brand panel, which superseded the elevated-pill/chip
  nav, which superseded the solid-primary block): the sidebar is a `surface-0` panel
  with a hairline right border (dark: `surface-900` panel, `surface-800` border) and
  **no** rounded shell edge — the tenant's hue belongs on the state, not on the
  furniture. Flat `rounded-control` rows, neutral hover tint, active row =
  `bg-primary-100/60` (dark `bg-primary-1000/40`) with `text-primary-700` (dark
  `primary-300`) on **both** label and `.nav-icon`, active-trail group carrying the
  same treatment — the parent of the current page is highlighted exactly like the row
  itself (owner 2026-08-27, superseding the "one step quieter" trail: it is where you
  are, one level up), `aria-current` on the active row
  (`ariaCurrentWhenActive="page"`, wired at CP-2 — `routerLinkActive` does not set it
  for you), no shadows inside the nav. **The tint is never the only cue** (owner
  2026-08-27, superseding 23 § Direction 1's "no weight bump"): the active row also
  carries a `primary-600` / `primary-400` **marker bar** in the nav gutter and, on a
  child, one weight step to its parent's 500. Both are hue-independent — at the neutral
  fallback palette the bar still measures 4.83:1 where the tint measures 1.03:1.
  **The bar is a top-level cue only** (`.nav-rail > ul > li:has(> .nav-active,
  > .nav-group-active)::after`, owner 2026-08-27): it marks the entry you are *inside*,
  so an active child is carried by its tint and weight alone and the gutter stays clear
  of the tree. It hangs off the row's `li` because the links are `overflow-hidden` for
  the rail's width ease, offsets from the **top** (a group's `li` wraps its whole
  children list, so `top: 50%` lands in the middle of the group), and lives on
  **`::after`, since `::before` is the tree elbow** — sharing it silently deletes the
  elbow on the active row. Hover excludes `.nav-group-active` as well as `.nav-active`,
  or hovering either highlighted row washes its tint away.
  **Expanded groups draw a tree** (`.nav-tree` on the children list): a hairline rail
  from the parent icon's centre with a rounded elbow into each child, geometry derived
  from the existing gutters. **The child pill starts where the elbow ends** (owner
  2026-08-27 — supersedes running the tint under the connector): `.nav-child` is `ml-9`
  (22px rail + 14px reach = 36px) with `pl-2`, so the label stays at the same 44px it sat
  at under `pl-11` and only the fill's left edge moved. The connector now leads *into* the
  highlight instead of crossing its face; the pseudo-elements keep their `z-index: 1` as
  a guard on that joint. **Count badges** (`NavBadge.badge`, `.nav-badge`) render only
  when an entry carries a real number — the slot is built and stays **dormant** until the
  owner wires a counting source (23 § Open ⑤, closed 2026-08-27: deferred, owner-owned —
  never fill it with a placeholder or an invented count), and it
  rides **`accent`**, never emerald: emerald is a status colour here, and a count is
  information (23 § Direction 3). **Shipped at 23 CP-2 (2026-08-27)** — this
  paragraph is the inventory now. Both hover rules exclude `.nav-active`, or hovering
  the current row washes its tint away (`:hover` outranks a bare class). The global
  focus ring re-offsets against the panel inside `app-sidebar`, since
  `ring-offset-background` would halo every focused row in canvas grey.
  **The panel's footer carries the tenant identity card** (owner 2026-08-27, plan 23
  § Open ②): the reference's dark promo card has no honest job in a tenant admin, so
  the slot answers *whose* admin this is — tenant logo (dark variant by theme) or name,
  plus a muted caption, behind `BrandState.loaded` so it never flashes the manttio
  fallback at a branded tenant; the collapsed rail shows the square mark alone, and
  nothing at all when the tenant has no isologo. The panel lives in its own `app-sidebar` component
  (`layouts/components/sidebar/`, extracted 2026-07-23) rendered by both the desktop
  aside and the mobile drawer; desktop collapses to a `w-20` **icon rail** (owner
  2026-07-23, toggled by a floating `size-4` chevron handle straddling the panel's
  right edge at `top-5`, persisted as `AppState.sidebarCollapsed`):
  rail icons link to the group's landing route and reveal a `.nav-flyout` submenu on
  hover/focus (CSS-only `:hover`/`:focus-within` — keyboard path is the normal tab
  order; width snaps, no width animation per the transform/opacity motion rule);
  micro-labels (`text-2xs font-bold`) for
  card/section/table headers — **title/sentence case, never uppercase** (QA 2026-07-07:
  uppercase is reserved for warnings or explicit requests; headings/labels render in
  their authored case);
  tabular numerals on every numeric column; skeleton loaders for content regions
  (spinners only inside buttons).
- **No emojis, anywhere** — templates, empty states, toasts, copy. Icons carry all
  iconography.
- **No AI-slop aesthetics (added 2026-07-05):** banned outright — glowing/colored
  drop shadows, neon gradients, purple→cyan / pink→blue washes, gradient text,
  glassmorphism (backdrop-blur + glow; **owner exception 2026-07-22: popovers only**
  may carry a *subtle* liquid-glass treatment — translucent surface + backdrop blur,
  neutral shadow, no glow or gradient tint; in-page surfaces never),
  animated gradient backgrounds, sparkle/magic
  iconography. This is a professional environment; clients must never read the
  product as AI-generated. Color arrives through palette scales and status pills.
  Sole tolerated gradient: a subtle single-hue area fill under chart lines.
- **Icons: outlined only — `@lucide/angular`** (the maintained successor of
  `lucide-angular`). `size-4` inline, `size-5` nav, stroke-2
  everywhere; never PrimeIcons in our own templates (PrimeNG's internal chevrons are
  the only tolerated appearance), never filled/duotone sets.
- **Simplicity rules (owner, 2026-07-21):** (1) **no arbitrary Tailwind values in
  templates** (`h-[235px]`, `h-[calc(...)]`) — standard scale utilities only
  (`h-56`); a size that must be exact belongs in a stylesheet, not inline brackets.
  (2) **Tabular/feed data renders as `p-table`** (the customers-list idiom:
  header/body templates, `rowHover`, whole-row click, `[scrollable]` +
  `scrollHeight` for internal scroll, `emptymessage` with the `.empty-icon`
  disc + one sentence, and — since CP-3 (2026-07-22) — `[showLoader]="false"`
  + a `#loadingbody` of 8 `.skeleton`-bar rows instead of the spinner
  overlay) — never hand-rolled `<ol>`/`<div>` row lists. (3) **Simple fixed sizing beats layout machinery:**
  fixed card heights + internal scroll, page-scoped CSS only — never shell-layout
  surgery (flex-chain rewiring, route-data layout flags) for one page's sizing.
- **Motion system (revised 2026-07-06 — Angular native, not anime.js):** Angular's
  `animate.enter`/`animate.leave` class bindings + `src/animations.scss`, which owns
  the keyframes and tokens as CSS custom properties — `--motion-fast` 150ms (micro
  feedback, exits), `--motion-base` 220ms (enter/exit, accordions, reorder),
  `--motion-slow` 320ms (route/page content enter: fade + 6px rise, `.anim-page-enter`).
  `--ease-enter` (easeOutCubic) / `--ease-exit` (easeInCubic); list stagger via
  `.anim-stagger` (30ms, capped at 8); hover/focus via CSS `transition-colors`;
  PrimeNG overlays animate themselves (don't double-animate); every shared class
  collapses under `prefers-reduced-motion`.

## Accessibility (CRITICAL — added 2026-07-05)

Binding for every component; the skill carries the same list with implementation notes.

- **color-contrast** — ≥4.5:1 normal text, ≥3:1 large text.
- **focus-states** — visible `:focus-visible` ring (2–4px, primary) on every
  interactive element; never remove an outline without replacing it.
- **alt-text** — descriptive `alt` on meaningful images; `alt=""` on decorative.
- **aria-labels** — `aria-label` on every icon-only button; icons themselves
  `aria-hidden`.
- **keyboard-nav** — tab order = visual order; full keyboard support; no positive
  `tabindex`.
- **form-labels** — real `<label [for]>` (or `aria-labelledby`) on every control;
  placeholders are not labels.
- **skip-links** — "skip to main content" (shell owns it).
- **heading-hierarchy** — sequential h1→h6, one h1 per page, no skips.
- **color-not-only** — state always pairs color with icon/text (pills carry labels).
- **dynamic-type** — rem-based type; layout survives 200% zoom without truncation.
- **reduced-motion** — `prefers-reduced-motion` respected (motion.ts guard).
- **voiceover-sr** — meaningful accessible names; logical DOM reading order; live
  regions for toasts.
- **escape-routes** — cancel/back in every modal and multi-step flow; ESC closes.
- **keyboard-shortcuts** — don't hijack system/a11y shortcuts; keyboard alternative
  for any drag interaction (repeater reorder gets up/down buttons).

## Layout & responsive (HIGH — added 2026-07-05)

- **viewport-meta** — `width=device-width, initial-scale=1`; never disable zoom.
- **mobile-first** — build mobile-first, scale up (sidebar→drawer; tables→scroll
  containers).
- **breakpoint-consistency** — Tailwind breakpoints only (`sm`–`2xl`); no ad-hoc
  media queries.
- **readable-font-size** — ≥16px body + **≥16px inputs on mobile** (iOS auto-zoom);
  compact 13–14px table text is desktop scope.
- **line-length-control** — prose 35–60 chars mobile / 60–75 desktop (tables exempt).
- **horizontal-scroll** — never page-level on mobile; wide tables scroll in their own
  `overflow-x-auto`.
- **spacing-scale** — Tailwind's 4px scale only; no arbitrary pixel spacing.
- **touch-density** — the `h-11 sm:h-10` baseline keeps 44px touch targets below `sm`;
  no cramped tap clusters.
- **container-width** — the main container is **full-width** (owner, 2026-07-21 —
  supersedes the earlier `max-w-7xl` cap): content claims every pixel the chrome
  leaves free; only the `px-4 sm:px-6` gutters remain. Prose/help copy still respects
  line-length-control inside its own block.
- **z-index-management** — in-page layers `0/10/20/40`; PrimeNG overlays own 1000+.
- **fixed-element-offset** — fixed topbar/sidebar reserve padding; nothing hides
  beneath them.
- **scroll-behavior** — inner `<main>` is the single scroll region; no competing
  nested scrolls.
- **viewport-units** — `min-h-dvh`, not `100vh`.
- **orientation-support** — usable in landscape.
- **content-priority** — core content first on mobile; secondary folds.
- **visual-hierarchy** — size/spacing/contrast build hierarchy, never color alone.

## Styling

- **Tailwind CSS 3.4 only.** Do not upgrade or downgrade. If a new utility/class is needed,
  add it to `tailwind.config.js` (extend `theme`) rather than using arbitrary values inline.
- **Radius language is tokenized (owner 2026-07-22, plan 17):** `rounded-card`
  (1rem — cards, panels, dialogs, table shells; the sidebar has **no** rounded edge
  since 23 CP-2, and the `shell` step that curved it was deleted with it — a token
  with no users is debt) · `rounded-chip` (0.75rem — icon chips, popovers) ·
  `rounded-control` (0.5rem — inputs, **buttons** (2026-07-22, default-PrimeNG
  turn), nav rows, small in-card surfaces) · `rounded-full` (status/role pills +
  chrome icon-circles only). New chrome uses these — never raw
  `rounded-lg`/`xl`/`2xl`; page templates migrate as the plan 17 CP-3..5
  passes touch them. Values mirror the preset's `border.radius` tokens.
- Prefer `size-*` over paired `w-*`/`h-*` when width and height are equal
  (e.g. `w-4 h-4` → `size-4`).
- **Never** use inline `style="..."` attributes (or `[style]` / `[ngStyle]`) in templates.
  All styling goes through Tailwind classes or component-scoped styles. (One exception —
  added 2026-07-06 — the brand editor's runtime previews: color-swatch backgrounds and
  font-sample `font-family` bind `[style.*]` because user-picked brand values can't be
  utility classes. The old dialog-width `[style]` exception was retired at CP-4
  (2026-07-22) — see Dialogs below. Nothing else qualifies.)
- The color palette is the **runtime tenant brand**, shared with `frontend/` and `website/`:
  **two tenant scales, `primary` and `accent`**, reading `--brand-primary-*`/
  `--brand-accent-*` (HSL components, steps **0…1000 by 100** — no `-50`/`-950`;
  contract rework 2026-07-12, accent added by plan 22 on 2026-08-26). Those two are the
  whole tenant contract — **the chrome neutral is not shared any more.** Superadmin keeps
  a third scale, `surface-*`, same utility names and steps but fixed literal values: it
  reads no CSS variable and no tenant can retune it (`hsl(240 5% L%)` — cooled from pure
  gray at 23 CP-1, which is both the reference console's canvas and the cast `zinc` gives
  the other two apps; the lightness ladder never moved). `frontend/` and `website/` deleted
  theirs and use **stock Tailwind `zinc`** instead (owner, 2026-08-27) — same idea, no
  config to maintain, but `zinc-50…950`, not `surface-0…1000`. Do not copy neutral classes
  between the apps; whether superadmin follows them onto zinc is still open (22 § Decisions).
  Utility name = wire name (plan 16, superadmin leg landed
  2026-07-21; the legacy `sky`/`granite`/`navy`/`cyan` names are tombstoned in
  `tailwind.config.js` — they emit no CSS). Use those scales or the semantic aliases
  (`background`, `surface`, `primary`, `accent`, `dark` — `secondary` retired with plan 22:
  it was `primary-300`, the missing-accent workaround). The role-pill blue ladder is
  the one sanctioned literal-hex island (`.role-pill--*` in `styles.scss` — static across
  tenants by design, 14 §1). **Do not introduce new ad-hoc hex values.**
- **Reuse the global classes from `styles.scss`** before re-styling locally: `.field-input`
  (form controls), `.field-label`, `.field-group`, `.field-hint` / `.field-error`
  (feedback lines under a control — CP-4), `.btn-primary` / `-secondary` / `-neutral`
  / `-danger`, `.link-action` (inline text-button/link — "Agregar X" repeater adds,
  upload labels, "ver todos" card links; CP-4), `.card`, `.card-section`, `.callout`
  (+ `--info`/`--warn`/`--danger` — bordered note/alert panels; CP-4), `.seg-tabs` /
  `.seg-tab` (+ `.seg-tab-active`, `--danger` — the inline editor tab switcher;
  CP-4), and the CP-3 list trio — `.row-action` (+ `--danger`/`--success`/`--grab` —
  icon-ghost actions: table rows, editor repeater reorder/remove, rich-text toolbar;
  widened beyond tables at CP-4, disabled steps dim to 0.4), `.skeleton` (loading
  bars), `.empty-icon` (empty-state disc). For a `p-table` inside a padded card,
  wrap it in `.card-flush-table` (theme/table.scss, owner 2026-07-23): cancels the
  card's px-6 so the table bleeds edge-to-edge and sheds its own rounded/shadow
  chrome — canon: the CRM dashboard feed cards. They already carry dark variants and
  disabled/focus states; re-implementing them in templates almost always misses one.
  These globals are **ported from `frontend/src/styles.scss`** in shell CP-2 — keep them
  byte-compatible where possible so fixes can flow between apps.
- `.field-input` is **fixed at 40px desk / 44px touch (`h-11 sm:h-10`) with a SOFT
  BRANDED 1px outline that strengthens on approach**: `primary-600/40` tint at rest
  → solid `primary-600` hover → `primary-700` + halo focus. Dark mode rides the
  light end of the primary scale (`primary-400/40` → solid `400` → `400` + halo)
  because a dark primary vanishes on the `surface-900` field. (Owner 2026-07-22,
  third revision that day: softened from the solid dark-primary rest, which
  superseded the neutral `surface-700` Diamond outline, the pale hairline, and the
  48px `h-12`/`border-2` chrome before it. The preset's `formField` border tokens
  carry the same values for PrimeNG controls — the alpha rest values as raw
  `hsl(var())`, since tokens can't alpha-reference.) Still a deliberate deviation
  from the frontend's
  56px/`h-14` (the field app is glove-friendly mobile capture; the superadmin is a
  desk console). Text is 16px below `sm` (iOS auto-zoom) and `text-sm` from `sm` up.
  Every control snaps to that one baseline: `.field-input` carries it for raw
  inputs, and `src/theme/forms.scss` applies the same responsive sizing to every
  PrimeNG form control (`<p-select>`, `<p-datepicker>`, `<input pInputText>`,
  `<p-inputnumber>`) over stock Aura chrome (plan 17 — no token is
  breakpoint-aware). Textareas opt out via `!h-auto`; compact controls (paginator
  rows-per-page in `table.scss`, dropdown filter inputs in `forms.scss`) opt down
  to `!h-9`. A non-standard height goes in those sheets, never a parallel class.
- **Dialogs** (`<p-dialog>`, `<p-confirmDialog>`) take their width as
  **`styleClass="dialog-sm|md|lg"`** (plan 17 CP-4, 2026-07-22 — supersedes the inline
  `[style]` width + separate `max-w-11/12` clamp): three steps in `overlays.scss` —
  `sm` 28rem (the default), `md` 30rem (roomier confirm/apply), `lg` 34rem (two-column
  forms) — each already carrying the `max-w-11/12` phone clamp. Apply one on **every**
  dialog; a new width step is a sheet change, never an inline style. The clients-editor
  drawer's `drawer-form` class (full-width phone / 28rem from `sm`) lives in the same
  sheet.

## Angular

- Superadmin runs **Angular 21** (frontend is on 20). Same idioms apply; do not use
  deprecated patterns just because frontend still carries them.
- Always use **`inject()`** — never constructor-parameter injection.
  `private http = inject(HttpClient);`
- Prefer **Reactive Forms** (`FormBuilder` + `FormGroup` + `formControlName`) over
  `[(ngModel)]` for any form group.
- Use the **built-in control flow**: `@if`, `@else if`, `@else`,
  `@for (item of items; track item.id)`, `@switch/@case/@default`. Never `*ngIf`, `*ngFor`,
  `*ngSwitch`, or `<ng-template>`-based fallbacks. Drop `CommonModule` when control flow is
  all you needed it for.
- **No inline component-method calls in templates (added 2026-07-06 — binding).**
  A method call in a binding (`statusLabel(row)`, `gridClass(s)`) re-executes on
  every change-detection pass. Use instead: **signal reads** (fine and idiomatic),
  **getters/property access** (`form.dirty`, `ctrl.value`, `array.controls`),
  **`computed()`** for page-level derived values, and **pure pipes in
  `src/app/pipes/`** for per-row/per-item mappings (labels, severities, form
  casts — pure pipes memoize per input). Event handlers (`(click)="save()"`)
  are unaffected. Canonical pipes: `cast.pipe.ts` (`asGroup`/`asControl`/
  `formArray`).
- Prefer **signals (`signal`, `computed`)** for reactive component state. For NGXS reads use
  the top-level **`select(...)`** from `@ngxs/store`
  (`reports = select(ReportsState.list);`) — never `this.store.selectSignal(...)`. Still
  `inject(Store)` for `dispatch`. Templates call signals as functions (`{{ total() }}`), no
  `async` pipe on them. Plain constants (option lists, fixed enums) stay regular fields.
- Inside NGXS `@Action` handlers, write the body as an **RxJS pipeline** and return the
  observable — never `async`/`await`. Wrap Promise-returning deps with `from(...)`;
  sequence with `switchMap`/`concatMap`/`mergeMap`; `finalize` for cleanup, `catchError`
  for per-item failure handling. `store.dispatch(...)` already returns an Observable.
  Canonical shape: `frontend/src/state/offline-reports/offline-reports.state.ts`.
- **List pages: URL-persisted filters via `ListQueryService` (added 2026-07-08 —
  binding).** Every list page persists its filters + page as GET query params and loads
  **only** from the `queryParamMap` subscription (back/forward walks the filter history;
  filtered views are shareable). Inject the **component-provided**
  `ListQueryService` (`app/services/table/list-query.service.ts`,
  `providers: [ListQueryService]`) — it owns page clamping, the `[first]` paginator
  offset, filter→URL navigation (empty → param drops off), lazy-load page changes, and
  the refetch/step-back refresh. The component keeps only its `read`/`write` param
  mapping (**sanitize on read**: `keyIn` whitelists for enum params, validate/clamp
  everything else — garbage never reaches state or the API), typed query building, and
  the dispatch. Never hand-roll filter/pagination wiring in a component. Canon consumer:
  `users/pages/users-list/users-list.ts` (05 §3).
  **A new lazy list page also gets a case in `e2e/lists/list-pagination.spec.ts`**
  (21 CP-6, added 2026-08-27): route, endpoint, a 25-row seed and the row's first-cell
  reader — two lines of fixture. The guard turns to page 2 and asserts the URL, the
  issued request *and* the leading row together, because PrimeNG in lazy mode renders
  whatever it is handed: a list whose request never carried `page=2` re-renders page 1
  and looks perfectly healthy. That is exactly how the clients list shipped broken.
  Any spec that loads a **real shell page** also calls `stubIdleApi(page)` *before*
  `signIn` — unstubbed reads otherwise reach a dev backend on `:8788`, which answers the
  fake e2e token with a real 401 and logs the session out mid-test (a red that only
  appears when a backend happens to be running).
- **Filters live in a popover (owner, 2026-07-22 — Chakra-style):** list pages render
  their filter fields inside the shared
  `shared/components/filters-popover` component — a `Filtros` trigger (filter icon +
  active-count badge) sitting **left of the page's primary action** — instead of an
  always-open grid; the table claims the reclaimed space. Pass the page's URL param
  names as `[params]` (the active count and Limpiar both derive from the URL — the
  single load path stays intact). Overlay-bearing controls projected inside must
  **not** use `appendTo="body"` (their overlay has to live inside the popover DOM or
  the outside-click dismiss swallows it).

## PrimeNG

- PrimeNG in **styled mode with the Aura preset** customized to the tenant palette
  (`primary`/`surface` — the preset reads the same `--brand-*` vars as the Tailwind
  scales, and since plan 16 the utility names match). The preset is ported from
  `frontend/src/app/theme/manttio-preset.ts`; if the palette tweaks in
  `tailwind.config.js`, keep the preset in sync.
- **Preset-first chrome (owner 2026-07-22, plan 17 — supersedes the
  sheet-per-component approach):** components render **stock Aura**; shape/spacing/
  color decisions are expressed as `ManttioPreset` design tokens (semantic
  `formField`, `colorScheme` primary/formField, per-component tokens like the
  button pill radius). **Never add a new override sheet for chrome.** A sheet in
  `src/theme/` is justified only by (a) a need no token can express (the responsive
  control baseline in `forms.scss`) or (b) layout-integration, not look (overlay
  anchoring in `overlays.scss`, table density + paginator in `table.scss`, the tabs
  nav-button kill) — plus the two house visual cues (`tag.scss` status pills,
  `popover.scss` liquid glass). Every surviving sheet opens with why it exists;
  hold new ones to the same bar.
- `theme.options.cssLayer: { name: 'primeng', order: 'tailwind-base, primeng' }`
  puts Aura in a named layer so the **surviving sheets in `src/theme/*.scss` win**
  without `!important` — no PrimeNG overrides in component styles or templates.
  The `order` string is load-bearing (2026-07-22): PrimeNG injects it as the
  first `<style>` in `<head>`, before `styles.css`, so IT establishes the layer
  order — Tailwind's preflight (wrapped in `tailwind-base` in `styles.scss`)
  must be named first or its `border-width: 0` reset silently strips every Aura
  component border (the pre-plan-17 override sheets had been masking exactly
  this). Keep the `@layer tailwind-base, primeng;` statement in `styles.scss`
  declaring the same order.
- Reach for PrimeNG before hand-rolling overlays/feedback: **`<p-dialog>`** for modals,
  **`<p-confirmDialog>`** + `ConfirmationService` for confirms, **`<p-popover>`** for
  popover menus (outside-click/ESC/positioning solved), **`<p-toast>`** + `MessageService`
  for notifications. Never `Swal` or `alert()`.
- Use **`appendTo="body"`** on `<p-popover>`/`<p-dialog>` when the trigger sits inside a
  small layout context, so a future `overflow:hidden`/`transform` ancestor can't clip it.
- Admin tables are **`<p-table>`** with lazy loading + pagination against server-side
  queries (list endpoints take `page`/`limit`/filters). One table shape per module, defined
  in that module's plan.

## Dialog extraction — three shapes, pick by what the dialog *owns*

1. **Trivial yes/no confirm, no form** → `ConfirmationService.confirm({...})` against the
   global `<p-confirmdialog />`. No component.
2. **Presentational shell** (renders content, forwards events, parent owns dispatch) →
   standalone component with `visible = model(false)` + `output()` events.
   (frontend canon: `leave-draft-dialog`, `sign-submit-dialog`.)
3. **Self-contained** (owns selection/form state + NGXS dispatch + toasts) → component
   under `<feature>/components/<thing>-dialog/` (or `shared/components/` when reused
   globally) with an imperative `open(target?)` API and internal
   `dialogOpen = signal(false)`. Parent holds `private dlg = viewChild<TheDialog>('dlg');`
   and calls `this.dlg()?.open(row)`. For dialogs fired from non-UI sources, wire through a
   root `@Injectable` bridge service exposing a `Subject`.
   (frontend canon: `delete-user-dialog`, `sync-pending-reports-dialog`.)

Don't bake business dispatch into shape 2, and don't pull form/state into the page when
shape 3 fits.

## Dark mode

- `<html>.app-dark` is the **single source of truth** — Tailwind
  (`darkMode: ['class', '.app-dark']`) and PrimeNG (`darkModeSelector: '.app-dark'`) both
  read it. No parallel toggle.
- State lives at `AppState.darkMode`, persisted via the NGXS storage plugin. The root `App`
  component mirrors it onto `<html>` via an `effect()`.
- Global classes already handle dark mode. When a template hardcodes a raw color, pair it
  with its dark variant:

  | Light | Dark |
  |---|---|
  | `bg-background` (page bg) | `dark:bg-surface-1000` |
  | `bg-white` (cards/panels) | `dark:bg-surface-900` |
  | `bg-surface-0` | `dark:bg-surface-900` |
  | `bg-primary-0` / `bg-amber-50` / `bg-red-50` / `bg-emerald-50` | `dark:bg-primary-1000/40` / `dark:bg-amber-950/30` / `dark:bg-red-950/30` / `dark:bg-emerald-950/30` |
  | `text-surface-1000` (titles) | `dark:text-surface-0` |
  | `text-surface-900` | `dark:text-surface-100` |
  | `text-surface-800` | `dark:text-surface-200` |
  | `text-surface-700` / `-600` / `-500` (muted) | `dark:text-surface-300` / `-400` / `-400` |
  | `text-primary-800` / `-700` (accent labels) | `dark:text-primary-300` |
  | `border-surface-200` / `-300` | `dark:border-surface-700` |

- **Status pills** (`bg-amber-100 text-amber-900`, etc.) stay unchanged in dark mode —
  intentionally vibrant in both. (Superadmin uses pills heavily: CRM status, billing
  status, material stock states — same rule everywhere.)

## Forms + interactive state

- Bind **`[disabled]="form.invalid"`** on submit buttons so `.btn-*`'s
  `disabled:opacity-50 disabled:cursor-not-allowed` actually fires.
- Config-driven form builders default controls to **`Validators.required`** unless the
  field is explicitly optional. An empty form disables submit out of the box.
- Wrap hover/active tints in the **`enabled:`** modifier
  (`enabled:hover:bg-primary-800 enabled:active:bg-primary-900`) so disabled buttons don't flash.
- **Validation display canon (plan 17 CP-4, 2026-07-22):** the inline error is
  `<p class="field-error" role="alert">` directly under its control, gated on
  **`touched && errors?.['key']`** (never `dirty`-gated, never per-keystroke) —
  every scalar field with a named label and a failable validator carries one.
  Persistent helper copy is `<p class="field-hint">`. Required markers stay
  `<span aria-hidden="true"> *</span>` on the label (uncolored). Repeater-row
  internals rely on Aura's automatic `.ng-invalid.ng-dirty` red border + the
  disabled submit instead of per-row messages (noise). Group-level failures
  (fiscal all-or-nothing, password mismatch) render a `.callout--warn` or a
  `.field-error` under the group, also `role="alert"`.

Forms & feedback rules (MEDIUM — added 2026-07-05; implementation notes in the skill):

- **input-labels** — visible label, never placeholder-only · **error-placement** —
  error below its field · **submit-feedback** — loading → success/error on submit ·
  **required-indicators** — asterisk on required labels · **empty-states** — message
  + action (icon, no emojis) · **toast-dismiss** — auto-dismiss 3–5s ·
  **confirmation-dialogs** — confirm destructive actions (delete-dialog shapes) ·
  **input-helper-text** — persistent helper under complex inputs ·
  **disabled-states** — 0.38–0.5 opacity + cursor + semantic attribute ·
  **progressive-disclosure** — reveal complexity gradually (e.g. the color-scale
  advanced expander) · **inline-validation** — validate on blur, not keystroke ·
  **input-type-keyboard** — semantic types (`email`/`tel`/`number`) ·
  **password-toggle** — show/hide on passwords · **autofill-support** — proper
  `autocomplete` attrs · **undo-support** — undo for bulk/destructive where the
  domain allows; append-only trails rely on confirm-heavy dialogs instead ·
  **success-feedback** — brief confirmation (toast/checkmark) · **error-recovery** —
  every error offers a path (retry/edit/help) · **multi-step-progress** — step
  indicator + back · **form-autosave** — long editors autosave or at minimum carry
  the dirty-navigation guard · **sheet-dismiss-confirm** — confirm dismissing
  unsaved modals/drawers · **error-clarity** — cause + fix, never "Invalid input" ·
  **field-grouping** — related fields grouped (card-sections) ·
  **read-only-distinction** — read-only ≠ disabled, visually and semantically ·
  **focus-management** — failed submit focuses first invalid field ·
  **error-summary** — multi-error summary with anchor links (WCAG) ·
  **touch-friendly-input** — mobile inputs ≥44px (the baseline is `h-11` below `sm`; `!h-9` is
  desktop-scope) · **destructive-emphasis** — danger color, separated from primary ·
  **toast-accessibility** — toasts don't steal focus, `aria-live="polite"` ·
  **aria-live-errors** — errors announce via `role="alert"`/`aria-live` ·
  **contrast-feedback** — error/success colors meet 4.5:1 · **timeout-feedback** —
  timeouts surface clearly with retry.

## Animations

- **Angular native + `animations.scss` only** (revised 2026-07-06; supersedes the
  original anime.js rule). Motion runs through Angular's `animate.enter` /
  `animate.leave` class bindings paired with the shared keyframes in
  `src/animations.scss`; the deprecated `@angular/animations` package and anime.js
  are both off the table. No ad-hoc keyframes in component styles — new animations
  are added to `animations.scss` inside its `prefers-reduced-motion` guard.
- All durations/easings come from the **CSS custom properties in `animations.scss`**
  (`--motion-fast/base/slow`, `--ease-enter/exit` — Design language section) — never
  hardcode milliseconds in components.

Animation rules (MEDIUM — added 2026-07-05; implementation notes in the skill):

- **duration-timing** — 150–300ms micro-interactions, ≤400ms complex, never >500ms
  (the tokens comply — use them) · **transform-performance** — animate
  `transform`/`opacity` only, never width/height/top/left · **loading-states** —
  skeleton/progress when loading >300ms · **excessive-motion** — 1–2 animated
  elements per view max · **easing** — ease-out in / ease-in out, never linear ·
  **motion-meaning** — cause-effect, never decoration · **state-transition** — state
  changes animate, don't snap · **continuity** — directional/spatial continuity
  between screens · **parallax-subtle** — sparingly, reduced-motion aware ·
  **spring-physics** — natural physics curves for gesture-driven motion (CSS
  `linear()` approximations if ever needed), cubic tokens
  for standard enter/exit · **exit-faster-than-enter** — exits ~60–70% of enter
  (base 220 in / fast 150 out) · **stagger-sequence** — 30–50ms per item (ours 30ms,
  cap ~8) · **shared-element-transition** — where practical; approximate with
  directional slides v1 · **interruptible** — user input cancels in-progress motion ·
  **no-blocking-animation** — UI stays interactive · **fade-crossfade** — crossfade
  in-place content swaps · **scale-feedback** — press scale 0.95–1.05 on tappables ·
  **gesture-feedback** — drags track the pointer in real time · **hierarchy-motion**
  — enter from below = deeper, exit up = back · **motion-consistency** — global
  tokens only, one rhythm · **opacity-threshold** — never linger below 0.2 ·
  **modal-motion** — spatial context from trigger (PrimeNG's dialog motion counts;
  don't double-animate) · **navigation-direction** — forward left/up, back
  right/down, consistent · **layout-shift-avoid** — no reflow/CLS from animation.

## Auth + access

- JWT lives in NGXS (frontend parity); **no frontend JWT decoding** — the HTTP interceptor
  handles 401s; the backend is the sole authority on validity.
- Role/config gating reads **only** from the `/auth/me` payload in `AuthState`, through
  the shared `access.ts` helpers (`hasRole`, `hasModule`) and route
  `data: { module, roles }`. Never duplicate matrix logic in components — see
  `14-access-control.md` (binding for all modules).

## Folder + code layout (mirrors frontend)

```
src/app/<feature>/pages/<page>/            # routed pages per module
src/app/<feature>/components/<thing>/      # per-feature widgets + dialogs
src/app/shared/components/                 # cross-feature widgets (2+ consumers)
src/app/validators/                        # shared ValidatorFns (e.g. rfc.validator.ts)
src/app/data/dtos/<resource>/              # DTOs per resource
src/app/model/constants/<entity>/          # shared/domain constants — ONE constant per
                                           #   <constant-name>.const.ts file (added 2026-07-06;
                                           #   label/severity maps, option lists, matrices).
                                           #   Component-local tuning values may stay local.
src/app/pipes/                             # pure pipes (template mappings — see Angular rules)
src/app/data/utils.ts                      # shared helpers (port toParams, errorMessage)
src/state/<resource>/                      # NGXS state + actions
src/http/<resource>.service.ts             # one HTTP service per resource
src/app/theme/manttio-preset.ts            # Aura preset (ported)
src/theme/*.scss                           # per-component PrimeNG override sheets
```

- Port **`toParams`** and **`errorMessage`** from `frontend/src/app/data/utils.ts` verbatim;
  add new general-purpose helpers there with a one-line doc entry, same as frontend.
