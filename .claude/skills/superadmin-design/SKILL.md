---
name: superadmin-design
description: Design language + UI/UX rules for the superadmin/ Angular app. Use whenever creating or editing any superadmin component, page, template, style sheet, or animation — it encodes the "solid & tight" visual language every module agent must follow.
---

# Superadmin design language — solid & tight

Canonical source: `superadmin/plans/01-conventions.md` (this skill mirrors its Typography
+ Design language sections — if they disagree, the plan file wins and this skill needs
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
- List/table appear: stagger 25ms, cap at ~8 items (rest appear instantly).
- Hover/focus states are CSS transitions (Tailwind `transition-colors`), not anime.js.
- Dialogs/popovers: PrimeNG's own show/hide — do not double-animate them.
- Every anime.js call goes through the reduced-motion guard in `shared/motion.ts`.

## Component checklist (before closing any UI task)

- [ ] No emojis; all icons Lucide outlined, stroke-2, standard sizes
- [ ] Controls snap to the `h-12` baseline (or `!h-10` compact)
- [ ] Borders not shadows on in-page surfaces; dark-mode pairings applied
- [ ] Status rendered as pills; numeric columns `font-data`/tnum
- [ ] Motion uses `MOTION` tokens + reduced-motion guard
- [ ] Global classes (`.field-input`, `.btn-*`, `.card`) reused, not re-implemented
