# 01 — Conventions: styling + component writing style

> **Status:** done (doc — the porting *tasks* live in `02-app-shell.md` CP-2)
> **Owner:** — · **Last updated:** 2026-07-05

These rules are ported from `frontend/CLAUDE.md` and are **binding for every superadmin
module agent**. Where the two apps diverge, this file wins for `superadmin/`. Read this
before writing any component.

---

## Styling

- **Tailwind CSS 3.4 only.** Do not upgrade or downgrade. If a new utility/class is needed,
  add it to `tailwind.config.js` (extend `theme`) rather than using arbitrary values inline.
- Prefer `size-*` over paired `w-*`/`h-*` when width and height are equal
  (e.g. `w-4 h-4` → `size-4`).
- **Never** use inline `style="..."` attributes (or `[style]` / `[ngStyle]`) in templates.
  All styling goes through Tailwind classes or component-scoped styles. (Single exception,
  inherited from frontend: the dialog width idiom `[style]="{ width: '32rem' }"` paired with
  the `max-w-11/12` cap — see Dialogs below.)
- The color palette is shared with `frontend/` and `website/`: the `granite`, `navy`, `sky`,
  `cyan` scales and semantic tokens (`background`, `surface`, `primary`, `secondary`,
  `dark`). **Do not introduce new ad-hoc hex values.**
- **Reuse the global classes from `styles.scss`** before re-styling locally: `.field-input`
  (form controls), `.field-label`, `.field-group`, `.btn-primary` / `-secondary` / `-neutral`
  / `-danger`, `.card`, `.card-section`. They already carry dark variants and
  disabled/focus states; re-implementing them in templates almost always misses one.
  These globals are **ported from `frontend/src/styles.scss`** in shell CP-2 — keep them
  byte-compatible where possible so fixes can flow between apps.
- `.field-input` is **fixed at 56px** (`h-14`) so every control snaps to one baseline —
  `<p-select>`, `<p-datepicker>`, `<input pInputText>`, `<p-inputnumber>` all inherit it.
  Textareas opt out via `!h-auto`; compact controls (paginator rows-per-page, dropdown
  filter inputs) opt down to `!h-11`. A non-standard height gets an `!h-*` override in that
  component's theme sheet, never a parallel class.
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

## PrimeNG

- PrimeNG in **styled mode with the Aura preset** customized to the manttio palette
  (`primary` = sky scale, `surface` = granite scale). The preset is ported from
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
  | `bg-background` (page bg) | `dark:bg-granite-950` |
  | `bg-white` (cards/panels) | `dark:bg-granite-900` |
  | `bg-granite-50` | `dark:bg-granite-900` |
  | `bg-sky-50` / `bg-amber-50` / `bg-red-50` / `bg-emerald-50` | `dark:bg-sky-950/40` / `dark:bg-amber-950/30` / `dark:bg-red-950/30` / `dark:bg-emerald-950/30` |
  | `text-granite-950` (titles) | `dark:text-granite-50` |
  | `text-granite-900` | `dark:text-granite-100` |
  | `text-granite-800` | `dark:text-granite-200` |
  | `text-granite-700` / `-600` / `-500` (muted) | `dark:text-granite-300` / `-400` / `-400` |
  | `text-sky-800` / `-700` (accent labels) | `dark:text-sky-300` |
  | `border-granite-200` / `-300` | `dark:border-granite-700` |

- **Status pills** (`bg-amber-100 text-amber-900`, etc.) stay unchanged in dark mode —
  intentionally vibrant in both. (Superadmin uses pills heavily: CRM status, billing
  status, material stock states — same rule everywhere.)

## Forms + interactive state

- Bind **`[disabled]="form.invalid"`** on submit buttons so `.btn-*`'s
  `disabled:opacity-50 disabled:cursor-not-allowed` actually fires.
- Config-driven form builders default controls to **`Validators.required`** unless the
  field is explicitly optional. An empty form disables submit out of the box.
- Wrap hover/active tints in the **`enabled:`** modifier
  (`enabled:hover:bg-sky-800 enabled:active:bg-sky-900`) so disabled buttons don't flash.

## Animations

- **anime.js only**, and only as an animation tool. No CSS keyframes, no Angular
  animations, no other libs unless explicitly requested.

## Auth

- JWT lives in NGXS; **guards check token presence only** (no frontend JWT decoding); the
  HTTP interceptor handles 401s; the backend is the sole authority on validity.

## Folder + code layout (mirrors frontend)

```
src/app/<feature>/pages/<page>/            # routed pages per module
src/app/<feature>/components/<thing>/      # per-feature widgets + dialogs
src/app/shared/components/                 # cross-feature widgets (2+ consumers)
src/app/validators/                        # shared ValidatorFns (e.g. rfc.validator.ts)
src/app/data/dtos/<resource>/              # DTOs per resource
src/app/data/utils.ts                      # shared helpers (port toParams, errorMessage)
src/state/<resource>/                      # NGXS state + actions
src/http/<resource>.service.ts             # one HTTP service per resource
src/app/theme/manttio-preset.ts            # Aura preset (ported)
src/theme/*.scss                           # per-component PrimeNG override sheets
```

- Port **`toParams`** and **`errorMessage`** from `frontend/src/app/data/utils.ts` verbatim;
  add new general-purpose helpers there with a one-line doc entry, same as frontend.
