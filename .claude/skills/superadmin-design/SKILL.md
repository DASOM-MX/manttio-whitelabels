---
name: superadmin-design
description: Design language + UI/UX rules for the superadmin/ Angular app. Use whenever creating or editing any superadmin component, page, template, style sheet, or animation — it encodes the "bright console" visual language every module agent must follow.
---

# Superadmin design language — bright console

Canonical source: `.claude/plans/superadmin/01-conventions.md` (this skill mirrors its
Typography, Design language, Accessibility, Layout & responsive, Animations, and
Forms & feedback sections — if they disagree, the plan file wins and this skill needs
updating in the same commit).

The look (re-lit 2026-08-27, plan 23 — **bright console**; evolves plan 17's
soft-executive, which superseded the field-app-derived "solid & tight" density
heritage — WCAG contrast rules untouched throughout): a clean, breathable business
console — stock PrimeNG Aura chrome on a **light shell**, white `rounded-card`
surfaces separated by a **hairline border** under a soft neutral lift shadow, airy
chrome around dense data, strong status cues, restrained motion — never decoration.
Data speaks with **two brand colours (`primary` + `accent`) plus a fixed
emerald/red/amber status set**, never with tints of one hue.

Plan 17's skeleton stands (preset-first chrome, page rhythm, `page-header` everywhere,
`rounded-control` buttons, neutral shadows, compact data). Three things it decided are
superseded here and marked in place: the dark brand-panel sidebar, shadow-only cards,
and `primary-400` as the decorative accent. Two of the three have shipped (bordered
cards at 23 CP-1, the light shell at 23 CP-2); **the `primary-400` sweep is still
pending at 23 CP-6**, so if the code disagrees with that one bullet today, the doc is
the target and the code is the backlog.

## Hard rules (non-negotiable)

1. **No emojis. Anywhere.** Not in templates, empty states, toasts, placeholder copy, or
   comments that render. Icons carry all iconography.
2. **Outlined icons only — `@lucide/angular`** (the maintained successor of
   `lucide-angular`). Never PrimeIcons in our own templates
   (PrimeNG's internal chevrons/close glyphs are the only tolerated appearance), never
   filled/duotone sets, never inline SVG one-offs when a Lucide glyph exists.
   Defaults: `size-4` inline with text, `size-5` in nav/buttons-only contexts,
   stroke-width 2 everywhere (don't vary it per icon).
3. **Typeface is Figtree** (variable, self-hosted
   `@fontsource-variable/figtree`; owner 2026-07-22, plan 17 — supersedes
   Nunito Sans/Quicksand/Commissioner).
   **600 body · 700 labels/buttons/headings**, 800+ for the wordmark and rare
   emphasis (owner 2026-08-27 "use 200 more points" — the 2026-07-22 400/500
   ladder moved up two steps wholesale; size + tracking still carry hierarchy
   and no active state bumps weight). The 600 baseline lives on `body`; write a
   weight utility only where a rung differs.
   Numeric table/money cells use the **`font-data` stack with `tnum`, headed by
   Work Sans Variable** (owner 2026-08-27 — supersedes Atkinson Hyperlegible,
   whose 400/700-only faces could not follow the ladder). Both faces are
   variable, so `font-data` tracks the same rungs as the body text.
   Adopting a numeric face means **measuring** its digits, never reading its
   feature list — Commissioner declared `tnum` and it was a no-op (2026-07-06).
   Self-hosted only — never `fonts.googleapis.com`.
4. **Motion = Angular's native `animate.enter`/`animate.leave` + `src/animations.scss`**
   (revised 2026-07-06; supersedes the original anime.js mandate). Keyframes and
   tokens live in `animations.scss` only — no anime.js, no deprecated
   `@angular/animations` package, no ad-hoc keyframes in component styles.
   Always respect `prefers-reduced-motion` (the shared classes already collapse
   under the media query — use them instead of hand-rolling).
5. **No AI-slop aesthetics.** This is a professional tool and must read as one —
   clients should never suspect "AI-generated product." Banned outright: glowing /
   colored drop shadows (`shadow-*` with color, `box-shadow` halos), neon gradients,
   purple→cyan / pink→blue gradient washes, gradient text, glassmorphism
   (backdrop-blur + translucent glow — owner exception 2026-07-22: **popovers only**
   may carry a subtle liquid-glass treatment: translucent surface + backdrop blur,
   neutral shadow, no glow/gradient tint; in-page surfaces never),
   animated gradient backgrounds, and decorative
   "sparkle/magic" iconography. Color arrives through the palette scales and status
   pills — never through gradient decoration. The only tolerated gradient is a
   **subtle single-hue area fill under chart lines** (data-viz, like the reference),
   nothing else.
6. **No arbitrary Tailwind values in templates** (`h-[235px]`, `h-[calc(...)]`) —
   standard scale utilities only (`h-56`); a size that must be exact belongs in a
   stylesheet, not inline brackets (owner, 2026-07-21).
7. **Tabular/feed data renders as `p-table`** (the customers-list idiom: header/body
   templates, `rowHover`, whole-row click, `[scrollable]` + `scrollHeight` for
   internal scroll, `emptymessage` with the `.empty-icon` disc + one sentence, and —
   since CP-3 (2026-07-22) — `[showLoader]="false"` + a `#loadingbody` of 8
   `.skeleton`-bar rows instead of the spinner overlay; row-level icon actions use
   `.row-action`/`--danger`/`--success` — since CP-4 the same classes cover editor
   repeater reorder/remove buttons and toolbar icon-ghosts, `--grab` for drag
   handles) — never hand-rolled `<ol>`/`<div>` row lists (owner, 2026-07-21).
   Inside a padded card, wrap the table in `.card-flush-table` (theme/table.scss)
   so it bleeds to the card edges (owner 2026-07-23; canon: CRM dashboard feeds).
8. **Simple fixed sizing beats layout machinery.** Fixed card heights + internal
   scroll, page-scoped CSS only — never shell-layout surgery (flex-chain rewiring,
   route-data layout flags) for one page's sizing (owner, 2026-07-21).
9. **PrimeNG chrome is preset-first** (owner 2026-07-22, plan 17): component look
   comes from **stock Aura + `ManttioPreset` design tokens**
   (`app/theme/manttio-preset.ts`) — never a new override sheet in `src/theme/`.
   The only surviving sheets are layout-integration rules and house visual cues no
   token can express (`forms`, `overlays`, `tag`, `table`, `popover`, `tabs` — each
   opens with why it exists); adding one requires the same justification.

## Density — low-to-mid whitespace

- Baseline control height is **40px desk / 44px touch: `.field-input` = `h-11 sm:h-10`**
  with a **soft branded 1px outline that strengthens on approach**: `primary-600/40`
  tint at rest → solid `primary-600` hover → `primary-700` + halo focus (dark mode
  `primary-400/40` → solid `400` → `400` + halo — a dark primary vanishes on the
  `surface-900` field, so the ladder rides the light end of the scale. Owner
  2026-07-22, third revision that day: softened from the solid dark-primary rest,
  which superseded the neutral `surface-700` Diamond outline, the pale hairline, and
  the 48px `h-12`/`border-2` chrome; still a deliberate deviation from the
  frontend's `h-14`). The preset's `formField` border tokens carry the same values
  for PrimeNG controls (alpha rest values as raw `hsl(var())` — tokens can't
  alpha-reference). Text 16px below `sm`, `text-sm` from `sm` up.
  Compact contexts (paginator rows-per-page, dropdown filter inputs) opt down to
  `!h-9`.
- Cards: `p-6` (plan 17 breathable rhythm — supersedes the soft-UI turn's `p-5`).
  Section gaps `gap-5`/`gap-6`. Page gutters `px-4 sm:px-6 md:px-8` + `py-6`
  (shell-owned, CP-2); topbar and sidebar header strips sit at `h-14` (slimmed from
  `h-16`, owner 2026-07-22) and level, so the topbar's hairline bottom rule runs
  unbroken across both. Airy chrome, dense data.
- Tables are compact: `py-2.5` cells, 13–14px cell text, header row as a
  micro-label (see cues below).
- Prefer one dense, well-grouped screen over two airy ones — but never sacrifice the
  baseline alignment: every control on a row snaps to the same height.

## Surfaces — bordered elevation (owner 2026-08-27, plan 23 CP-1; supersedes 17's shadow-only cards)

- Cards/panels: white `rounded-card` (1rem — the tokenized radius, see boundary below)
  on the tinted page bg with **a hairline `surface-200` border AND the soft neutral
  `shadow-card`** (`.card`/`.card-section` carry both; dark = `surface-900` fill,
  `surface-800` border, deepened `.app-dark` shadow). The border separates; the shadow
  only lifts — on a near-white canvas a shadow alone stops reading. A standalone
  `p-table` is a card and gets the same treatment (`theme/table.scss`); inside a padded
  card, `.card-flush-table` sheds the whole treatment, border included. Hairlines are
  also still the *internal* divider. PrimeNG panels match without an override sheet:
  Aura's content/overlay border is already `{surface.200}` in light, and the preset
  pulls dark from `{surface.700}` to `{surface.800}`.
  The shell follows the same rule: since 23 CP-2 the sidebar dropped its 2026-07-21
  shadow for a hairline right border (a shadow between two near-white surfaces
  separates nothing). **The topbar is SECTIONED** since 2026-08-27 (23 CP-2, supersedes
  the 2026-07-22 surfaceless strip): a `surface-0` bar with a hairline bottom rule
  continuous with the sidebar panel, the sidebar's `border-r` as the vertical seam, a
  **filled borderless** search pill, and **three separate 2px-bordered circles** trailing
  (`.topbar-action` ×2 + `.topbar-avatar`, `size-8` with `size-4` icons, `gap-2`:
  theme · bell · account) —
  never a shared pill, and the account circle carries no name or chevron. The circles use
  `border-2`, **not `ring-2`** (owner 2026-08-27) — the stroke belongs inside the box so
  `gap-2` stays a true 8px between edges.
  `.topbar-search` is a deliberately **`disabled` stub** (owner 2026-08-27, 23
  § Open ①): the chrome ships, the capability is **plan 24** — never quietly enable it,
  and the `⌘K` hint is not a live binding yet — but the chip **stays** (owner 2026-08-27):
  it previews the affordance, and a `disabled` control cannot swallow the keystroke. The shell also stays **edge-to-edge** —
  the reference's inset rounded app frame was declined (owner 2026-08-27, 23 § Open ③).
  **Depth needs contrast:** the `background` alias
  sits at `surface-100` in superadmin (one step under card whites, owner 2026-07-22) —
  keep page-level surfaces on `bg-background`, never on `bg-white`.
- **Entity rows lead with an initials avatar**: `size-9 rounded-full bg-primary-100
  text-primary-800` (dark `primary-1000/60`/`primary-300`) + the shared `initials`
  pipe — canon: customers-list Cliente column.
- Shadows are always **neutral black alpha** — a colored/glowing shadow is still
  banned AI-slop.
- Nested grouping inside a card = background shift (`bg-surface-100 dark:bg-surface-800/40`)
  or a hairline divider — not another shadowed box.
- **Palette roles (plan 23, decided 2026-08-27)** — three voices that never trade places:
  - **`primary`** = interactive + identity: buttons, links, focus, active nav row, hero
    chart series, the one highlighted bar in a comparison.
  - **`accent`** (real tenant scale, DEFAULT `accent-500`) = the second brand voice:
    secondary chart series, the second segment of a segmented bar, informational badges,
    decorative chips, a gauge fill when the metric is neutral rather than good/bad.
    **Never the sole carrier of a status meaning.**
  - **Fixed semantic set** (not brand-derived): emerald = positive/up, red =
    negative/down, amber = warning/pending. Deltas, revenue direction, good/bad gauges.
    A tenant's hue must never be able to make "down" look green.

  `primary-400`-as-decorative-accent is retired. Interactive solids stay
  `primary-600`/`700` — white text on 400 fails 4.5:1. The straggler sweep (`.icon-chip`
  — the unused `--soft` variant went at 17 CP-5 — progress bars, highlight numbers) lands
  at **23 CP-6**; until then those still read `primary-400`. A tenant that never set
  `accent` renders it as the neutral fallback ramp (branding rule 3) — gray, not an
  invented hue, and that is correct.
- The palette is `primary-*` and `accent-*` (tenant-configured, via `--brand-primary-*` /
  `--brand-accent-*`) plus `surface-*` — same utility names and steps, but **fixed literal
  values**: surface is the chrome neutral, reads no CSS variable, and no tenant retunes it
  (`hsl(240 5% L%)` — cooled from pure gray at 23 CP-1; only hue/saturation moved, the
  lightness ladder and every contrast ratio stayed put).
  Steps 0…1000 by 100 (no `-50`/`-950`; plan 16 tombstoned `sky`/`granite`/`navy`/`cyan` —
  those classes emit no CSS). `secondary` retired with plan 22. Sole literal-hex island:
  the static role-pill ladder
  (`.role-pill--*` in `styles.scss`).
  **`surface-*` is superadmin's alone.** The field app and the website deleted their copies
  on 2026-08-27 and use stock Tailwind `zinc-50…950` for chrome, so neutral classes no
  longer port between the apps — only `primary-*`/`accent-*` do.
- **Default-PrimeNG buttons** (owner 2026-07-22: "blob-like buttons do not look
  clean" — supersedes the 2026-07-21 blob/pill buttons): actions are
  `rounded-control` rectangles at the input radius, stock-Aura `px-4` — the
  `.btn` family carries it, paginator pages follow via `table.scss`, and any
  future `<p-button>` via the preset's button `borderRadius: {border.radius.lg}`
  token. Ghost icon-only buttons in chrome (topbar bell/theme/menu, avatars)
  stay circles — chrome, not actions. **Button copy is the bare verb** where
  context disambiguates — "Guardar", never "Guardar cambios"/"Guardar y
  aplicar" (owner 2026-07-22); qualify only when two same-verb actions share a
  view. Nav rows are flat `rounded-control`
  (Diamond turn, owner 2026-07-22). Boundary (tokenized 2026-07-22 in
  `tailwind.config.js`): inputs/buttons/nav `rounded-control` (0.5rem),
  cards/dialogs/table shells `rounded-card` (1rem; the sidebar has no rounded edge
  since 23 CP-2 — a light panel has a border, not a curve — and the `shell` radius
  step was deleted with it), icon chips +
  popovers `rounded-chip` (0.75rem), status/role
  pills + chrome icon-circles `rounded-full` — never raw `rounded-lg`/`xl`/`2xl`
  in new chrome.

## Strong visual cues

- **Page header** (plan 17 §5, CP-2): every routed page opens with the shared
  `app-page-header` (`shared/components/page-header`) — single `h1`
  (`text-2xl font-semibold tracking-tight`), optional muted description, optional
  `backLink`, `meta` slot for title-adjacent status tags, default slot for
  right-aligned actions; it owns the `mb-6` rhythm. Never hand-roll an `<h1>` row.
  Title-only — no breadcrumbs unless the owner opts in.
- **Status pills** everywhere state exists (CRM status, billing, stock, visit status) —
  vibrant in both modes per the dark-mode rules; pill + label, never color alone.
- **Active nav**: a soft tinted row on a **light panel** (owner 2026-08-26, plan 23 —
  supersedes the 2026-07-22 dark brand panel, which superseded the elevated-pill/chip
  nav): the sidebar is a `surface-0` panel with a hairline right border (dark:
  `surface-900` panel, `surface-800` border) and **no** rounded shell edge — brand rides
  the state, not the furniture. Flat `rounded-control` rows, neutral hover tint, active
  row = `bg-primary-100/60` (dark `bg-primary-1000/40`) with `text-primary-700` (dark
  `primary-300`) on **both** label and `.nav-icon`, and `aria-current` on the active row
  (`ariaCurrentWhenActive="page"` — `routerLinkActive` does not set it for you). No
  shadows inside the nav — and the tint is **never the only cue**: the active row also
  carries a `primary-600`/`primary-400` marker bar in the nav gutter, and an active child
  steps up one weight to its parent's 500 (owner 2026-08-27; supersedes 23 § Direction 1's
  "no weight bump" — the tint measures 1.03:1 at the neutral fallback palette, the bar
  4.83:1). The **parent of the current page is highlighted like the row itself**, and the
  **bar is top-level only** — an active child gets the tint and the weight step, never a
  bar, so the gutter stays clear of the tree. The marker lives on the row's `li` as
  `.nav-rail > ul > li:has(> .nav-active, > .nav-group-active)::after`; `::before`
  is the **tree elbow** of `.nav-tree`, the hairline rail + rounded connectors expanded
  groups draw, and sharing the pseudo-element deletes the elbow on the active row.
  **The child pill starts where the elbow ends** (owner 2026-08-27): `.nav-child` is
  `ml-9` + `pl-2` — 22px rail + 14px reach = 36px — so the connector leads into the tint
  instead of across it, and the label sits at the same 44px as before.
  **Count badges** (`.nav-badge`) render only for a real number and ride `accent`, never
  emerald — emerald is a status colour, a count is information.
  **Shipped 2026-08-27 at 23 CP-2.** Both hover rules exclude
  `.nav-active` (`:hover` outranks a bare class, so an un-excluded hover washes the
  active tint away), and the focus ring re-offsets against the panel inside
  `app-sidebar`. The footer carries the **tenant identity card** — logo (dark variant by
  theme) or name plus a muted caption, gated on `BrandState.loaded`, square mark only in
  the rail (owner 2026-08-27, § Open ②: a tenant admin has nothing honest to promote, so
  the reference's promo slot answers *whose* admin this is). The panel is the `app-sidebar` component
  (`layouts/components/sidebar/`); desktop collapses to a `w-20` icon rail
  (owner 2026-07-23, persisted `AppState.sidebarCollapsed`) whose rows reveal
  `.nav-flyout` submenus on hover/focus — CSS-only, width snaps (no width
  animation per transform-performance).
- **Stat cards** (reference idiom): micro-label + trailing Lucide icon, `font-data`
  value, a delta pill (emerald/red from the fixed semantic set, arrow, **sign always
  shown**) and a muted comparison caption under it. Tiles are the one unit tighter than
  the page rhythm: `p-5`, label → value → caption, no extra air. The trailing glyph is a
  **white `.icon-chip` with `shadow-sm` and a `primary-600` mark** (dark: `surface-800`
  chip, `primary-400` mark) — owner 2026-08-27, superseding the filled `primary-400`
  square. The shared `kpi-tile` (shipped 23 CP-3) owns all of it — don't hand-roll a
  sixth copy; timelines pair small accent icons with micro-label timestamps.
- **Data-viz** (owner 2026-07-22, CRM-cockpit turn; re-coloured by plan 23's palette
  roles 2026-08-27): time series are `p-chart type="line"` — hero series `primary-600`
  (dark `primary-400`) with the sole tolerated gradient (a single-hue area fill of the
  hero colour fading to transparent), **secondary series `accent-500`** (the old
  neutral-end `primary-1000`/`primary-100` trick existed only because there was no
  second brand colour), `tension: 0.4`, no point dots, faint y-grid only, chart.js
  legend OFF — the legend is dot chips in the card header. Categorical mixes are
  **never pies**: proportional bars on a surface track, width relative to the top row,
  `font-data` counts, reading `primary` → `accent` → neutral; where one member is *the*
  answer (peak day, top channel) that bar alone is `primary-600` and the rest go
  neutral. Good/bad numbers never take a brand colour — fixed semantic set only. Chart
  canvases live in a fixed-height wrapper (`h-64`), host + inner div `h-full` (PrimeNG 21
  ignores `styleClass` on `p-chart`); colors re-read the brand CSS vars on theme change
  (canon: `crm/pages/dashboard` — the kit's first consumer at 23 CP-4; no page builds a
  chart by hand any more). **A rate reads as a `gauge-card`, not a numeral tile.** The
  shared `kpi-tile` / `segmented-bar` / `gauge-card` / `trend-card` **shipped 2026-08-27
  at 23 CP-3** under `shared/components/` and are mandatory from then on.
  - They take a **`VizTone`, never a class** (`model/enums/viz/viz-tone.enum.ts`):
    `Brand`/`Accent` = the two tenant voices, `Positive`/`Negative`/`Warning` = the
    fixed semantic set, `Neutral` = surface. Class maps sit in `model/constants/viz/`,
    one per surface kind (fill / SVG stroke / numeral / pill) — one tone needs
    different steps at 3:1 and at 4.5:1. `gauge-card` defaults to `Accent`: a rate with
    no good/bad direction is exactly the neutral case.
  - Values arrive **formatted** — the kit prints what it is handed; currency, percent
    points and separators stay at the call site.
  - Pure math + specs in `services/viz/` (segment shares and the narrow-member floor,
    gauge fill count, delta direction → tone). Canvas colours resolve live from
    `--brand-*` through `services/theme/chart-palette.service.ts`; the floating tooltip
    card is `services/chart/chart-tooltip.service.ts` and chart.js's canvas tooltip is
    switched off.
- **Table idioms** (reference crops, 23 CP-3; applied at CP-5) — idioms, not components.
  **The lead cell follows what the entity is:** people and companies → `.lead-avatar`
  (initials, canon: customers + users), photographable things → `.lead-thumb` (services'
  `websiteImageUrl`, equipment's `photos[0]`), missing photo → `.lead-thumb-fallback`
  (the entity's Lucide glyph on the same tile — never an empty grey square, never initials
  on a chiller); a list with these rows takes `table-paged--tall`. **Directional numeric**
  = `font-data tabular-nums` in the fixed semantic set with a `size-3` arrow, and *only*
  where the value has a direction — the CP-5 audit found none in the nine lists, so no
  column was coloured. **Rating cell** = one amber star + the value; no call site yet.
  Numeric cells inherit `tabular-nums` from `table.scss`.
- **List filters live in a popover** (owner 2026-07-22, Chakra-style): the shared
  `shared/components/filters-popover` trigger (filter icon + active-count badge) sits
  left of the page's primary action; pass the page's URL param names as `[params]`
  (count + Limpiar derive from the URL). Controls projected inside must not use
  `appendTo="body"` — their overlay must live inside the popover DOM.
- **Micro-labels** for card/section/table headers (`.micro-label`:
  `text-2xs font-bold text-surface-500 dark:text-surface-400`) — authored
  title/sentence case, never `uppercase` (QA 2026-07-07: uppercase is reserved for
  warnings or explicit requests).
- **Tabular numerals** (`font-data`) for every numeric column — digits align vertically.
- **Skeleton loaders** for content regions (tables, cards) instead of spinners; spinners
  only on buttons for in-flight actions.
- Empty states: Lucide icon + one sentence + primary action. No illustrations, no emojis.

## Motion — fluid, brief, purposeful

Tokens live as CSS custom properties in `src/animations.scss` (revised 2026-07-06 —
Angular `animate.enter`/`animate.leave` classes, not anime.js). Never hardcode
durations in components:

| Token | ms | Use |
|---|---|---|
| `--motion-fast` | 150 | micro feedback (chip toggles, icon swaps), exits |
| `--motion-base` | 220 | element enter/exit, accordions, repeater reorder |
| `--motion-slow` | 320 | route/page content enter |

- Easing: `--ease-enter` (easeOutCubic) for enters, `--ease-exit` (easeInCubic) for exits.
- Route/page enter: `.anim-page-enter` (fade + 6px rise) — the layout replays it per navigation.
- Element enter/exit: `animate.enter="anim-enter"` / `animate.leave="anim-leave"`.
- List/table appear: `.anim-stagger` on the container — 30ms per item, capped at 8.
- Hover/focus states are CSS transitions (Tailwind `transition-colors`), not keyframes.
- Dialogs/popovers: PrimeNG's own show/hide — do not double-animate them.
- All shared animation classes collapse under `prefers-reduced-motion` — add new
  keyframes to `animations.scss` inside the same guard, never in component styles.

## Animation (MEDIUM)

- **duration-timing** — 150–300ms for micro-interactions; complex transitions ≤400ms;
  never >500ms (MD). The tokens (150/220/320) already comply — use them.
- **transform-performance** — animate `transform`/`opacity` only; never
  width/height/top/left.
- **loading-states** — skeleton or progress indicator whenever loading exceeds 300ms.
- **excessive-motion** — animate 1–2 key elements per view, max.
- **easing** — ease-out entering, ease-in exiting; never linear for UI transitions.
- **motion-meaning** — every animation expresses a cause-effect relationship, never
  pure decoration (Apple HIG).
- **state-transition** — hover/active/expanded/collapsed/modal changes animate
  smoothly, don't snap.
- **continuity** — page/screen transitions maintain spatial continuity (directional
  slide, shared element) (Apple HIG).
- **parallax-subtle** — parallax sparingly (rarely fits this console); must respect
  reduced-motion, never disorient (Apple HIG).
- **spring-physics** — prefer natural physics curves for gesture-driven motion
  (CSS `linear()` spring approximations if ever needed); standard enter/exit keeps
  the cubic tokens (Apple HIG).
- **exit-faster-than-enter** — exits ~60–70% of enter duration: `base` 220ms enter
  pairs with the 150ms `fast` exit (MD motion).
- **stagger-sequence** — stagger list/grid entrances 30–50ms per item (ours: 30ms,
  cap ~8); never all-at-once or slow reveals (MD).
- **shared-element-transition** — hero/shared-element continuity where practical
  (View Transitions API out of scope v1 — approximate with directional slides)
  (MD, HIG).
- **interruptible** — animations are interruptible; user input cancels in-progress
  motion immediately (Apple HIG).
- **no-blocking-animation** — never block input during an animation; UI stays
  interactive (Apple HIG).
- **fade-crossfade** — crossfade for content replacement within the same container
  (MD).
- **scale-feedback** — subtle press scale (0.95–1.05) on tappable cards/buttons;
  restore on release (HIG, MD).
- **gesture-feedback** — drag/swipe/pinch give real-time visual response tracking the
  pointer (MD Motion).
- **hierarchy-motion** — translate/scale direction expresses hierarchy: enter from
  below = deeper, exit upward = back (MD).
- **motion-consistency** — durations/easings only from the global tokens; every
  animation shares one rhythm.
- **opacity-threshold** — don't linger below opacity 0.2; fade fully or stay visible.
- **modal-motion** — modals/sheets animate with spatial context from their trigger
  (scale+fade / slide-in); PrimeNG's dialog motion satisfies this — don't
  double-animate (HIG, MD).
- **navigation-direction** — forward navigates left/up; backward right/down — keep
  direction logically consistent (HIG).
- **layout-shift-avoid** — animations must not cause reflow or CLS; use transform for
  position changes.

## Forms & feedback (MEDIUM)

Implementation canon (plan 17 CP-4, 2026-07-22): the inline error is
`<p class="field-error" role="alert">` directly under its control, gated on
`touched && errors?.['key']` (never `dirty`, never per-keystroke); helper copy is
`<p class="field-hint">`; required markers are `<span aria-hidden="true"> *</span>`
on the label (uncolored). Repeater-row internals rely on Aura's automatic
`.ng-invalid.ng-dirty` red border + the disabled submit instead of per-row
messages. Bordered notes/warnings are `.callout` (+ `--info`/`--warn`/`--danger`);
inline text-buttons ("Agregar X", upload labels) are `.link-action`; editor tab
switchers are `.seg-tabs`/`.seg-tab` (+ `-active`, `-active--danger`); repeater
reorder/remove and toolbar icon-ghosts reuse `.row-action` (+ `--danger`/`--grab`).

- **input-labels** — visible label per input; never placeholder-only.
- **error-placement** — error text directly below the related field.
- **submit-feedback** — loading state, then success/error state on submit.
- **required-indicators** — mark required fields (asterisk on the label).
- **empty-states** — helpful message + action when no content (Lucide icon, one
  sentence, primary action — no emojis).
- **toast-dismiss** — auto-dismiss toasts in 3–5s.
- **confirmation-dialogs** — confirm before destructive actions (the audited
  delete-dialog shapes already enforce this — use them).
- **input-helper-text** — persistent helper text below complex inputs, not just
  placeholder (MD).
- **disabled-states** — reduced opacity (0.38–0.5) + cursor change + semantic
  attribute (`disabled`, `aria-disabled`) (MD).
- **progressive-disclosure** — reveal complex options progressively; don't overwhelm
  upfront (Apple HIG — e.g. the color-scale advanced expander).
- **inline-validation** — validate on blur, not per keystroke; show errors only after
  the user finishes input (MD).
- **input-type-keyboard** — semantic input types (`email`, `tel`, `number`, `url`) so
  mobile gets the right keyboard (HIG, MD).
- **password-toggle** — show/hide toggle on password fields (MD).
- **autofill-support** — proper `autocomplete` attributes so the browser can autofill
  (HIG, MD).
- **undo-support** — undo for destructive or bulk actions where the domain allows it
  ("Undo" toast); where audit rules forbid true undo (append-only trails), the
  confirm-heavy dialog is the guard (Apple HIG).
- **success-feedback** — confirm completed actions with brief visual feedback
  (checkmark, toast, color flash) (MD).
- **error-recovery** — error messages include a recovery path (retry, edit, help)
  (HIG, MD).
- **multi-step-progress** — multi-step flows show a step indicator; back navigation
  always available (MD).
- **form-autosave** — long editors (CMS home, brand editor) auto-save drafts or at
  minimum carry the dirty-navigation guard; never lose work to an accidental
  dismissal (Apple HIG).
- **sheet-dismiss-confirm** — confirm before dismissing a modal/drawer with unsaved
  changes (Apple HIG).
- **error-clarity** — errors state cause + how to fix, never just "Invalid input"
  (HIG, MD).
- **field-grouping** — group related fields (fieldset/legend or card-sections) (MD).
- **read-only-distinction** — read-only looks and reads different from disabled (MD).
- **focus-management** — after a failed submit, auto-focus the first invalid field
  (WCAG, MD).
- **error-summary** — multiple errors get a summary at top with anchor links to each
  field (WCAG).
- **touch-friendly-input** — mobile input height ≥44px (the baseline is `h-11` below
  `sm`; `!h-9` compacts are desktop-scope only) (Apple HIG).
- **destructive-emphasis** — destructive actions use the danger color and sit
  visually separated from primary actions (HIG, MD).
- **toast-accessibility** — toasts never steal focus; `aria-live="polite"` (WCAG).
- **aria-live-errors** — form errors announce via `aria-live` region or
  `role="alert"` (WCAG).
- **contrast-feedback** — error/success state colors meet 4.5:1 (WCAG, MD).
- **timeout-feedback** — request timeouts show clear feedback with a retry option
  (MD).

## Accessibility (CRITICAL)

- **color-contrast** — Minimum 4.5:1 ratio for normal text (large text 3:1; Material Design).
- **focus-states** — Visible focus rings on interactive elements (2–4px; Apple HIG, MD).
  Global `:focus-visible` ring in primary; never `outline: none` without a replacement.
- **alt-text** — Descriptive alt text for meaningful images (logos, evidence photos);
  `alt=""` for purely decorative ones.
- **aria-labels** — `aria-label` on every icon-only button (Lucide glyphs are
  `aria-hidden`; the button carries the label).
- **keyboard-nav** — Tab order matches visual order; full keyboard support (Apple HIG).
  No positive `tabindex`.
- **form-labels** — Every control gets a real `<label [for]>` (or `aria-labelledby`);
  placeholder is never the label.
- **skip-links** — "Skip to main content" link for keyboard users (shell owns it).
- **heading-hierarchy** — Sequential h1→h6, no level skip; one h1 per page.
- **color-not-only** — Don't convey info by color alone — pair with icon/text (pills
  already carry labels; keep it that way).
- **dynamic-type** — Support system text scaling: rem-based type, layout survives 200%
  browser zoom; avoid truncation as text grows (Apple Dynamic Type, MD).
- **reduced-motion** — Respect `prefers-reduced-motion`; reduce/disable animations when
  requested (already enforced via the `shared/motion.ts` guard).
- **voiceover-sr** — Meaningful accessible names/hints; logical DOM reading order for
  screen readers (Apple HIG, MD). Toasts announce via live regions (PrimeNG toast does).
- **escape-routes** — Provide cancel/back in modals and multi-step flows; ESC closes
  dialogs (Apple HIG).
- **keyboard-shortcuts** — Preserve system and a11y shortcuts; offer keyboard
  alternatives for drag-and-drop (e.g. repeater reorder gets up/down buttons; Apple HIG).

## Layout & responsive (HIGH)

- **viewport-meta** — `width=device-width, initial-scale=1`; never disable zoom.
- **mobile-first** — Design mobile-first, then scale up to tablet and desktop (sidebar
  collapses to drawer; tables get horizontal scroll containers).
- **breakpoint-consistency** — Systematic breakpoints only: Tailwind `sm 640 / md 768 /
  lg 1024 / xl 1280 / 2xl 1536` — no ad-hoc media queries.
- **readable-font-size** — Minimum 16px body text and **16px inputs on mobile** (avoids
  iOS auto-zoom); the 13–14px compact-table density is desktop scope.
- **line-length-control** — Mobile 35–60 chars per line; desktop 60–75 (prose/help
  copy — data tables exempt).
- **horizontal-scroll** — No page-level horizontal scroll on mobile; wide tables scroll
  inside their own `overflow-x-auto` container.
- **spacing-scale** — 4pt/8dp incremental spacing system (Tailwind's 4px scale — no
  arbitrary pixel values; Material Design).
- **touch-density** — Component spacing comfortable for touch: not cramped, no
  mis-taps — the baseline stays `h-11` (44px) below `sm`.
- **container-width** — the main container is **full-width** (owner, 2026-07-21 —
  supersedes the `max-w-7xl` cap): only the shell's `px-4 sm:px-6` gutters remain;
  prose blocks still self-limit line length.
- **z-index-management** — Layered scale: `0 / 10 / 20 / 40` for in-page layers; PrimeNG
  overlays own the 1000+ range — never compete with them.
- **fixed-element-offset** — Fixed topbar/sidebar reserve safe padding for underlying
  content; nothing renders beneath them unreachable.
- **scroll-behavior** — The inner `<main>` is the one scroll region (shell convention);
  avoid nested scroll areas that fight it.
- **viewport-units** — Prefer `min-h-dvh` over `100vh` on mobile.
- **orientation-support** — Layout stays readable and operable in landscape.
- **content-priority** — Core content first on mobile; fold or hide secondary content
  (summary strips collapse before tables do).
- **visual-hierarchy** — Establish hierarchy via size, spacing, contrast — not color
  alone.

## Component checklist (before closing any UI task)

- [ ] No emojis; all icons Lucide outlined, stroke-2, standard sizes
- [ ] No AI-slop: zero glow shadows, neon/duotone gradients, gradient text, or
      glassmorphism anywhere in the diff (sole sanctioned exception: the popover
      chrome's subtle liquid-glass, owned by `theme/popover.scss`)
- [ ] A11y pass: contrast ≥4.5:1, visible focus ring, `aria-label` on icon-only
      buttons, real `<label for>`s, heading order, keyboard-only walkthrough works
- [ ] Responsive pass: no page-level horizontal scroll at 375px, inputs ≥16px on
      mobile, wide tables in `overflow-x-auto`, `min-h-dvh` not `100vh`
- [ ] Controls snap to the `h-11 sm:h-10` baseline (or `!h-9` compact)
- [ ] Bordered elevation: cards `rounded-card` + hairline `surface-200` border +
      neutral `shadow-card` (dark `surface-900`/`surface-800`); no second bordered box
      nested inside a card; dark-mode pairings applied
- [ ] Palette roles honoured: `primary` interactive/identity, `accent` the second
      brand voice, emerald/red/amber for anything good/bad — and `accent` never
      carries a status meaning on its own
- [ ] Radius tokens only in new chrome (`rounded-card`/`chip`/`control`/`full`) —
      no raw `rounded-lg`/`xl`/`2xl`
- [ ] Status rendered as pills; numeric columns `font-data`/tnum
- [ ] Motion uses `MOTION` tokens + reduced-motion guard
- [ ] Global classes (`.field-input`, `.btn-*`, `.card`) reused, not re-implemented
- [ ] No new `src/theme/` sheets — PrimeNG chrome via `ManttioPreset` tokens
      (a sheet only for layout-integration, opening with why it exists)
