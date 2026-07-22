---
name: superadmin-design
description: Design language + UI/UX rules for the superadmin/ Angular app. Use whenever creating or editing any superadmin component, page, template, style sheet, or animation — it encodes the "solid & tight" visual language every module agent must follow.
---

# Superadmin design language — solid & tight

Canonical source: `.claude/plans/superadmin/01-conventions.md` (this skill mirrors its
Typography, Design language, Accessibility, Layout & responsive, Animations, and
Forms & feedback sections — if they disagree, the plan file wins and this skill needs
updating in the same commit).

The look (revised 2026-07-22, plan 17 — **soft-executive**): a clean, breathable
business console — stock PrimeNG Aura chrome carried on the soft personality: white
`rounded-2xl` cards floating on the tinted page background with soft neutral shadows,
pill actions, brand-accent chips, airy chrome around dense data, strong status cues,
and restrained motion — never decoration. (Supersedes the field-app-derived
"solid & tight" density heritage; WCAG contrast rules are untouched.)

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
   400 body · 500 labels/buttons · 600–700 headings. Numeric table/money cells use the
   `font-data` stack with `tnum` (Atkinson Hyperlegible head — unchanged).
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
   internal scroll, `emptymessage`) — never hand-rolled `<ol>`/`<div>` row lists
   (owner, 2026-07-21).
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
  (shell-owned, CP-2); topbar and sidebar header strips sit at `h-16`.
  Airy chrome, dense data.
- Tables are compact: `py-2.5` cells, 13–14px cell text, header row as a
  micro-label (see cues below).
- Prefer one dense, well-grouped screen over two airy ones — but never sacrifice the
  baseline alignment: every control on a row snaps to the same height.

## Surfaces — soft elevation (owner 2026-07-22, supersedes borders-not-shadows)

- Cards/panels: white `rounded-card` (1rem — the tokenized radius, see boundary
  below) floating on the tinted page bg with the soft neutral `shadow-card` (`.card`/`.card-section` carry it; `dark:bg-surface-900` with a
  deepened `.app-dark` shadow). **No hairline borders on card edges** — hairlines
  retire to *internal* dividers. The shell chrome keeps its 2026-07-21 shadows
  (`.shell-sidebar`/`.shell-topbar`). **Depth needs contrast:** the `background` alias
  sits at `surface-100` in superadmin (one step under card whites, owner 2026-07-22) —
  keep page-level surfaces on `bg-background`, never on `bg-white`.
- **Entity rows lead with an initials avatar**: `size-9 rounded-full bg-primary-100
  text-primary-800` (dark `primary-1000/60`/`primary-300`) + the shared `initials`
  pipe — canon: customers-list Cliente column.
- Shadows are always **neutral black alpha** — a colored/glowing shadow is still
  banned AI-slop.
- Nested grouping inside a card = background shift (`bg-surface-100 dark:bg-surface-800/40`)
  or a hairline divider — not another shadowed box.
- **Accent step:** `primary-400` is the decorative accent (the reference's teal,
  brand-mapped) — `.icon-chip` (filled) / `.icon-chip--soft` (white chip, accent
  glyph), single-hue chart area fills, progress bars, highlight numbers. Interactive
  solids stay `primary-600`/`700` — white text on 400 fails 4.5:1.
- The palette is the two semantic brand scales only — `primary-*` / `surface-*`, steps
  0…1000 by 100 (no `-50`/`-950`; plan 16 tombstoned `sky`/`granite`/`navy`/`cyan` —
  those classes emit no CSS). Sole literal-hex island: the static role-pill ladder
  (`.role-pill--*` in `styles.scss`).
- **Default-PrimeNG buttons** (owner 2026-07-22: "blob-like buttons do not look
  clean" — supersedes the 2026-07-21 blob/pill buttons): actions are
  `rounded-control` rectangles at the input radius, stock-Aura `px-4` — the
  `.btn` family carries it, paginator pages follow via `table.scss`, and any
  future `<p-button>` via the preset's button `borderRadius: {border.radius.lg}`
  token. Ghost icon-only buttons in chrome (topbar bell/theme/menu, avatars)
  stay circles — chrome, not actions. Nav rows are flat `rounded-control`
  (Diamond turn, owner 2026-07-22). Boundary (tokenized 2026-07-22 in
  `tailwind.config.js`): inputs/buttons/nav `rounded-control` (0.5rem),
  cards/dialogs/table shells `rounded-card` (1rem, sidebar edge
  `rounded-r-card`), icon chips + popovers `rounded-chip` (0.75rem), status/role
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
- **Active nav**: Diamond-style flat rows on the dark brand panel (owner
  2026-07-22, Diamond turn v2 per reference screenshot — supersedes the
  elevated-pill/chip nav): the sidebar is `primary-1000` in **both modes** with a
  rounded right edge + hairline `primary-800/50` outline; light-on-dark
  `rounded-control` rows (`primary-100`/`200` text, `primary-300` `.nav-icon`s), hover
  `white/10`, active child = solid `primary-600` row with white text
  (`.nav-active`), active-trail group = white text/icon (`.nav-group-active`).
  No shadows inside the nav.
- **Stat cards** (reference idiom): micro-label + `font-data` value + signed delta
  (`text-emerald-600`/`text-red-600`) with an `.icon-chip` on the trailing edge;
  timelines pair small accent icons with micro-label timestamps.
- **List filters live in a popover** (owner 2026-07-22, Chakra-style): the shared
  `shared/components/filters-popover` trigger (filter icon + active-count badge) sits
  left of the page's primary action; pass the page's URL param names as `[params]`
  (count + Limpiar derive from the URL). Controls projected inside must not use
  `appendTo="body"` — their overlay must live inside the popover DOM.
- **Micro-labels** for card/section/table headers (`.micro-label`:
  `text-2xs font-medium text-surface-500 dark:text-surface-400`) — authored
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
- [ ] Soft elevation: cards `rounded-card` + neutral `shadow-card`, no edge borders;
      hairlines only as internal dividers; dark-mode pairings applied
- [ ] Radius tokens only in new chrome (`rounded-card`/`chip`/`control`/`full`) —
      no raw `rounded-lg`/`xl`/`2xl`
- [ ] Status rendered as pills; numeric columns `font-data`/tnum
- [ ] Motion uses `MOTION` tokens + reduced-motion guard
- [ ] Global classes (`.field-input`, `.btn-*`, `.card`) reused, not re-implemented
- [ ] No new `src/theme/` sheets — PrimeNG chrome via `ManttioPreset` tokens
      (a sheet only for layout-integration, opening with why it exists)
