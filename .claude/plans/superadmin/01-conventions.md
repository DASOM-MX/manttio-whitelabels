# 01 — Conventions: styling + component writing style

> **Status:** done (doc — the porting *tasks* live in `02-app-shell.md` CP-2)
> **Owner:** — · **Last updated:** 2026-07-05

These rules are ported from `frontend/CLAUDE.md` and are **binding for every superadmin
module agent**. Where the two apps diverge, this file wins for `superadmin/`. Read this
before writing any component.

---

## Typography (decided 2026-07-05)

- **Superadmin's typeface is Commissioner** (variable, weight axis only — expressive
  flare/volume axes stay at defaults). This is a **deliberate deviation from frontend
  parity**: the superadmin is *our* product chrome, constant across tenants, and its
  own voice tells tenants who they're working with. Tenant-facing surfaces
  (`website/` + `frontend/` field app) are **brand-font-driven** instead:
  `Brand.font { body, heading? }` from the curated variable-font catalog
  (`03-branding.md` §2.1), defaulting to the business-identity pair **Work Sans
  (body) + Rubik (headings)** — the field app migrates off Inter to the brand-font
  CSS vars (recorded as a fork `frontend/` task, not superadmin work).
- **Self-hosted, never CDN:** `@fontsource-variable/commissioner` — one woff2,
  preloaded in `index.html`. No `fonts.googleapis.com` import (offline, CSP, no FOUT).
- Stacks in `tailwind.config.js`:
  `sans: ['"Commissioner Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif']`,
  plus a `data` stack for numeric table/money columns. Weights: **400 body ·
  500 labels/buttons · 600–700 headings**.
- **Tabular numerals:** data cells set `font-feature-settings: 'tnum'`.
  **Resolved at CP-2 (2026-07-06): Commissioner's tnum is a no-op** (digit widths
  measured unequal with the feature on), so `font-data` heads with **Atkinson
  Hyperlegible** (the frontend's existing numeric stack — tnum verified: all digit
  groups measure identically) with Commissioner everywhere else.
- PrimeNG inherits the body font — no per-component font overrides.

## Design language — solid & tight (decided 2026-07-05)

The superadmin reads as a dense, confident **operations console** (dark-fintech
reference). Solidity comes from hairline borders, compact rhythm, strong status cues,
and restrained motion — never decoration. The committed skill
**`.claude/skills/superadmin-design`** mirrors this section so every module agent
auto-loads it — **edit both in the same commit.**

- **Density (low-to-mid whitespace):** cards `p-4` (page-level summary cards max
  `p-5`); section gaps `gap-4`; compact tables (`py-2.5` cells, 13–14px text). Prefer
  one dense, well-grouped screen over two airy ones.
- **Borders, not shadows:** in-page surfaces use 1px hairlines
  (`border-surface-200 dark:border-surface-800`) on flat backgrounds; shadows are
  reserved for true overlays (dialogs, popovers, drawers). Nested grouping = background
  shift or divider, never another shadowed box. **Chrome exception (owner, 2026-07-21):**
  the app shell's sidebar + topbar separate via smooth *neutral* shadows instead of
  hairlines (`.shell-sidebar`/`.shell-topbar`) — the sidebar shares the page background
  so the nav blends with the content, the topbar keeps the card tone so the two strips
  read as distinct surfaces. Neutral black alpha only; colored glows stay banned.
- **Blob buttons (owner, 2026-07-21):** actions are smooth, almost blob-like — the
  `.btn` family is a pill (`rounded-full`, `px-5` so text clears the curve) and
  icon-only buttons are full circles (`rounded-full`); PrimeNG buttons, paginator
  pages, and dialog/drawer/toast close buttons follow via `.btn` inheritance + the
  theme sheets. **Actions only:** inputs (`.field-input`, icon-picker trigger) keep
  `rounded-lg`, nav items `rounded-md`, cards `rounded-xl`.
- **Strong cues:** status pills wherever state exists (never color alone); active nav =
  solid brand-primary block + light neutral shadow (`.nav-active`, steps mirror
  `.btn-primary`; owner redesign 2026-07-21 — supersedes the 2px accent-bar + tint
  idiom; group parents with an active child carry the soft tint via
  `.nav-group-active`); micro-labels (`text-2xs font-medium`) for
  card/section/table headers — **title/sentence case, never uppercase** (QA 2026-07-07:
  uppercase is reserved for warnings or explicit requests; headings/labels render in
  their authored case);
  tabular numerals on every numeric column; skeleton loaders for content regions
  (spinners only inside buttons).
- **No emojis, anywhere** — templates, empty states, toasts, copy. Icons carry all
  iconography.
- **No AI-slop aesthetics (added 2026-07-05):** banned outright — glowing/colored
  drop shadows, neon gradients, purple→cyan / pink→blue washes, gradient text,
  glassmorphism (backdrop-blur + glow), animated gradient backgrounds, sparkle/magic
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
  `scrollHeight` for internal scroll, `emptymessage`) — never hand-rolled
  `<ol>`/`<div>` row lists. (3) **Simple fixed sizing beats layout machinery:**
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
- **touch-density** — `h-12` baseline keeps 48px touch targets even at desk density;
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
- Prefer `size-*` over paired `w-*`/`h-*` when width and height are equal
  (e.g. `w-4 h-4` → `size-4`).
- **Never** use inline `style="..."` attributes (or `[style]` / `[ngStyle]`) in templates.
  All styling goes through Tailwind classes or component-scoped styles. (Two exceptions:
  the dialog width idiom `[style]="{ width: '32rem' }"` paired with the `max-w-11/12` cap
  — see Dialogs below — and, added 2026-07-06, the brand editor's runtime previews:
  color-swatch backgrounds and font-sample `font-family` bind `[style.*]` because
  user-picked brand values can't be utility classes. Nothing else qualifies.)
- The color palette is the **runtime tenant brand**, shared with `frontend/` and `website/`:
  exactly two scales, `primary` and `surface`, reading `--brand-primary-*`/
  `--brand-surface-*` (HSL components, steps **0…1000 by 100** — no `-50`/`-950`;
  contract rework 2026-07-12). Utility name = wire name (plan 16, superadmin leg landed
  2026-07-21; the legacy `sky`/`granite`/`navy`/`cyan` names are tombstoned in
  `tailwind.config.js` — they emit no CSS). Use those scales or the semantic aliases
  (`background`, `surface`, `primary`, `secondary`, `dark`). The role-pill blue ladder is
  the one sanctioned literal-hex island (`.role-pill--*` in `styles.scss` — static across
  tenants by design, 14 §1). **Do not introduce new ad-hoc hex values.**
- **Reuse the global classes from `styles.scss`** before re-styling locally: `.field-input`
  (form controls), `.field-label`, `.field-group`, `.btn-primary` / `-secondary` / `-neutral`
  / `-danger`, `.card`, `.card-section`. They already carry dark variants and
  disabled/focus states; re-implementing them in templates almost always misses one.
  These globals are **ported from `frontend/src/styles.scss`** in shell CP-2 — keep them
  byte-compatible where possible so fixes can flow between apps.
- `.field-input` is **fixed at 48px (`h-12`) in superadmin** — a deliberate deviation
  from the frontend's 56px/`h-14` (the field app is glove-friendly mobile capture; the
  superadmin is a tight desk console — see Design language). Every control snaps to
  that one baseline: `<p-select>`, `<p-datepicker>`, `<input pInputText>`,
  `<p-inputnumber>` all inherit it. Textareas opt out via `!h-auto`; compact controls
  (paginator rows-per-page, dropdown filter inputs) opt down to `!h-10`. A non-standard
  height gets an `!h-*` override in that component's theme sheet, never a parallel
  class.
- **Dialogs** (`<p-dialog>`, `<p-confirmDialog>`) are capped at **`max-w-11/12`** via
  `styleClass` (a `tailwind.config.js` extension). Inline pixel width stays for roomy
  viewports; the cap keeps a ~4% gutter on narrow screens. Apply on **every** dialog.

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

## PrimeNG

- PrimeNG in **styled mode with the Aura preset** customized to the tenant palette
  (`primary`/`surface` — the preset reads the same `--brand-*` vars as the Tailwind
  scales, and since plan 16 the utility names match). The preset is ported from
  `frontend/src/app/theme/manttio-preset.ts`; if the palette tweaks in
  `tailwind.config.js`, keep the preset in sync.
- `theme.options.cssLayer: { name: 'primeng' }` puts Aura in a named layer so
  **per-component override sheets in `src/theme/*.scss` win** without `!important`. To
  restyle a PrimeNG component, edit/add its sheet there and `@import` it in
  `src/theme/_index.scss` — no overrides in component styles or templates.
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
  **touch-friendly-input** — mobile inputs ≥44px (`h-12` complies; `!h-10` is
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
