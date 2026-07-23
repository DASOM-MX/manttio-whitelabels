# Superadmin conventions

The in-product admin (Angular 21, standalone + signals, zoneless; NGXS 21; PrimeNG 21
Aura + manttio preset; Tailwind 3.4). Canonical docs — read these first:

- **`.claude/plans/superadmin/01-conventions.md`** — the full conventions suite
  (typography, design language, a11y, layout, styling, Angular/NGXS/PrimeNG rules,
  dialogs, dark mode, animations, auth/access, folder layout). If this file and the
  skill ever disagree, the plan file wins.
- **`.claude/skills/superadmin-design`** — committed skill mirroring the design
  language so module agents auto-load it. Edit it **in the same commit** as plan 01.
- **`.claude/plans/superadmin/00-master-plan.md`** — module map + progress board +
  checkpoint protocol.

## Quick rules (the ones that get missed)

- **No emojis; Lucide outlined icons only** (`@lucide/angular`, stroke-2; `size-4`
  inline, `size-5` nav).
- **No arbitrary Tailwind values in templates** (`h-[235px]`, `h-[calc(...)]`) —
  standard scale utilities only (`h-56`); a size that must be exact belongs in a
  stylesheet, not inline brackets.
- **Tabular/feed data renders as `p-table`** (the customers-list idiom: header/body
  templates, `rowHover`, whole-row click into the detail view, `[scrollable]` +
  `scrollHeight` for internal scroll, `emptymessage`) — never hand-rolled
  `<ol>`/`<div>` row lists.
- **Simple fixed sizing beats layout machinery** — fixed card heights + internal
  scroll, page-scoped CSS only; never shell-layout surgery for one page's sizing.
- **No inline function calls in templates** — computed signals or pure pipes
  (`app/pipes/`); no `protected readonly Enum = Enum` template bridges.
- **Constants live in `model/constants/<entity>/`** (one constant per file); http
  services in `app/services/http/`; theme services in `app/services/theme/`; guards
  one-per-file in `app/guards/`; **never create `index.ts` barrels**.
- **Motion = Angular `animate.enter`/`animate.leave` + `src/animations.scss` tokens**
  — no anime.js, no ad-hoc keyframes in components; everything collapses under
  `prefers-reduced-motion`.
- **PrimeNG chrome is preset-first (plan 17):** stock Aura + `ManttioPreset` design
  tokens — never a new `src/theme/` override sheet for looks; sheets are only for
  layout-integration or house cues, and every one opens with why it exists.
- **List pages persist filters + page as URL query params** (`queryParamMap` is the
  single load path — users-list is canon). Filter fields render inside the shared
  `filters-popover` (trigger left of the page's primary action; no `appendTo="body"`
  on controls projected into it).
- **PrimeNG 21 gotcha:** `p-chart` ignores `styleClass` — bind `class` on the host
  and force its inner div `h-full` so chart.js's resize observer sizes the canvas
  (see `crm/pages/dashboard`).

## Build + verification

- `npm run build` must be green before closing any checkpoint; no screenshots unless
  asked (the owner watches :4200).
- E2E: Playwright specs in `e2e/` reuse the running `ng serve`, stub the backend with
  `page.route`, and seed `auth.token` in localStorage — helpers in
  `e2e/support/superadmin.ts`.
