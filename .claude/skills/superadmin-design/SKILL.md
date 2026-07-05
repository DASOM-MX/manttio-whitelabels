---
name: superadmin-design
description: Design language + UI/UX rules for the superadmin/ Angular app. Use whenever creating or editing any superadmin component, page, template, style sheet, or animation — it encodes the "solid & tight" visual language every module agent must follow.
---

# Superadmin design language — solid & tight

Canonical source: `superadmin/plans/01-conventions.md` (this skill mirrors its
Typography, Design language, Accessibility, Layout & responsive, Animations, and
Forms & feedback sections — if they disagree, the plan file wins and this skill needs
updating in the same commit).

The look: a dense, confident operations console (dark-fintech reference). Solidity comes
from hairline borders, compact rhythm, strong status cues, and restrained motion — never
from decoration.

## Hard rules (non-negotiable)

1. **No emojis. Anywhere.** Not in templates, empty states, toasts, placeholder copy, or
   comments that render. Icons carry all iconography.
2. **Outlined icons only — `lucide-angular`.** Never PrimeIcons in our own templates
   (PrimeNG's internal chevrons/close glyphs are the only tolerated appearance), never
   filled/duotone sets, never inline SVG one-offs when a Lucide glyph exists.
   Defaults: `size-4` inline with text, `size-5` in nav/buttons-only contexts,
   stroke-width 2 everywhere (don't vary it per icon).
3. **Typeface is Commissioner** (variable, self-hosted `@fontsource-variable/commissioner`).
   400 body · 500 labels/buttons · 600–700 headings. Numeric table/money cells use the
   `font-data` stack with `tnum`.
4. **anime.js is the only animation tool.** No CSS keyframes, no Angular animations.
   Always respect `prefers-reduced-motion` (skip the animation, land in the end state).
5. **No AI-slop aesthetics.** This is a professional tool and must read as one —
   clients should never suspect "AI-generated product." Banned outright: glowing /
   colored drop shadows (`shadow-*` with color, `box-shadow` halos), neon gradients,
   purple→cyan / pink→blue gradient washes, gradient text, glassmorphism
   (backdrop-blur + translucent glow), animated gradient backgrounds, and decorative
   "sparkle/magic" iconography. Color arrives through the palette scales and status
   pills — never through gradient decoration. The only tolerated gradient is a
   **subtle single-hue area fill under chart lines** (data-viz, like the reference),
   nothing else.

## Density — low-to-mid whitespace

- Baseline control height is **48px: `.field-input` = `h-12`** (deliberate deviation from
  the frontend's `h-14`; superadmin is a desk tool). Compact contexts (paginator
  rows-per-page, dropdown filter inputs) opt down to `!h-10`.
- Cards: `p-4` (page-level summary cards may take `p-5`, nothing larger). Section gaps
  `gap-4`. Page gutters `px-4 md:px-6`.
- Tables are compact: `py-2.5` cells, 13–14px cell text, header row as uppercase
  micro-label (see cues below).
- Prefer one dense, well-grouped screen over two airy ones — but never sacrifice the
  56px→48px baseline alignment: every control on a row snaps to the same height.

## Surfaces — borders, not shadows

- Cards/panels: `1px` hairline borders (`border-granite-200 dark:border-granite-800`),
  flat backgrounds (`bg-white dark:bg-granite-900`). **No drop shadows on in-page
  surfaces.** Shadows are reserved for true overlays (dialogs, popovers, drawers).
- Nested grouping inside a card = background shift (`bg-granite-50 dark:bg-granite-950/60`)
  or a hairline divider — not another shadowed box.

## Strong visual cues

- **Status pills** everywhere state exists (CRM status, billing, stock, visit status) —
  vibrant in both modes per the dark-mode rules; pill + label, never color alone.
- **Active nav**: 2px left accent bar in primary + tinted background — instantly locatable.
- **Uppercase micro-labels** for card/section/table headers:
  `text-[11px] font-medium tracking-caps text-granite-500 dark:text-granite-400 uppercase`.
- **Tabular numerals** (`font-data`) for every numeric column — digits align vertically.
- **Skeleton loaders** for content regions (tables, cards) instead of spinners; spinners
  only on buttons for in-flight actions.
- Empty states: Lucide icon + one sentence + primary action. No illustrations, no emojis.

## Motion — fluid, brief, purposeful

Tokens (put in `shared/motion.ts`, import everywhere — never hardcode durations):

| Token | ms | Use |
|---|---|---|
| `MOTION.fast` | 150 | micro feedback (chip toggles, icon swaps) |
| `MOTION.base` | 220 | element enter/exit, accordions, repeater reorder |
| `MOTION.slow` | 320 | route/page content enter |

- Easing: `easeOutCubic` for enters, `easeInCubic` for exits.
- Route/page enter: fade in + `translateY(6px → 0)` on the page container.
- List/table appear: stagger 30ms, cap at ~8 items (rest appear instantly).
- Hover/focus states are CSS transitions (Tailwind `transition-colors`), not anime.js.
- Dialogs/popovers: PrimeNG's own show/hide — do not double-animate them.
- Every anime.js call goes through the reduced-motion guard in `shared/motion.ts`.

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
  (anime.js `spring()`); standard enter/exit keeps the cubic tokens (Apple HIG).
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
- **touch-friendly-input** — mobile input height ≥44px (the `h-12` = 48px baseline
  complies; `!h-10` compacts are desktop-scope only) (Apple HIG).
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
  mis-taps — the `h-12` baseline keeps 48px targets even at desk density.
- **container-width** — Consistent max-width on desktop (`max-w-6xl`/`7xl` per page
  type; pick once in the shell, reuse).
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
      glassmorphism anywhere in the diff
- [ ] A11y pass: contrast ≥4.5:1, visible focus ring, `aria-label` on icon-only
      buttons, real `<label for>`s, heading order, keyboard-only walkthrough works
- [ ] Responsive pass: no page-level horizontal scroll at 375px, inputs ≥16px on
      mobile, wide tables in `overflow-x-auto`, `min-h-dvh` not `100vh`
- [ ] Controls snap to the `h-12` baseline (or `!h-10` compact)
- [ ] Borders not shadows on in-page surfaces; dark-mode pairings applied
- [ ] Status rendered as pills; numeric columns `font-data`/tnum
- [ ] Motion uses `MOTION` tokens + reduced-motion guard
- [ ] Global classes (`.field-input`, `.btn-*`, `.card`) reused, not re-implemented
