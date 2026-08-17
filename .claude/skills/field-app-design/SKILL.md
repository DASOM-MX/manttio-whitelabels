---
name: field-app-design
description: Conventions + UI/UX rules for the frontend/ Angular field app (technician PWA). Use whenever creating or editing any frontend/ component, page, template, style sheet, NGXS state, HTTP service, or offline/Dexie code — it encodes the app's structure, styling, PrimeNG, offline and dark-mode rules.
---

# Field-app conventions — `frontend/`

Canonical source: **`frontend/CLAUDE.md`** (this skill mirrors and expands it — if they
disagree, `frontend/CLAUDE.md` wins and needs updating in the same commit). Root
`CLAUDE.md` fork rules always win over both.

**What this app is:** the technician-facing PWA. Angular 20 standalone + **zoneless**,
NGXS 20, PrimeNG **20.4** Aura, Tailwind **3.4**, Dexie offline queue, service worker.
It is used one-handed, outdoors, on a phone, often with no signal. Every decision below
serves that: big touch targets, one column on small screens, nothing that silently fails
offline.

> **Not the superadmin app.** `superadmin/` is Angular 21 / PrimeNG 21 with its own
> `superadmin-design` skill, its own `model/enums|constants/` layout and its own visual
> language. Never carry a pattern across without checking it against this file.

## Hard rules (non-negotiable)

1. **Don't create new `index.ts` barrels.** Note the field app already has them under
   `src/app/data/dtos/<resource>/` and `src/app/data/constants/` — that is the existing
   local convention there, so adding an export to one of those is correct and churning
   them away is out of scope. The no-barrel rule came from superadmin (PR #66) and has
   never been applied to `frontend/`; don't proliferate barrels into new folders, and
   import concrete files everywhere else.
2. **Never `style="..."`, `[style]` or `[ngStyle]`** in templates. Tailwind classes or the
   component's own stylesheet.
3. **Tailwind 3.4 only** — never upgrade/downgrade, never arbitrary values (`w-[137px]`).
   Need something new? extend `tailwind.config.js`.
4. **`inject()` only** — never constructor-parameter DI. `private http = inject(HttpClient);`
5. **New control flow only** — `@if` / `@else` / `@for (x of xs; track x.id)` / `@switch`.
   Never `*ngIf`, `*ngFor`, `*ngSwitch`, `[ngIfElse]`, `<ng-template>` fallbacks. Drop
   `CommonModule` when it was only there for those.
6. **`select(...)` from `@ngxs/store`**, never `this.store.selectSignal(...)`. Still
   `inject(Store)` for `dispatch`.
7. **NGXS `@Action` handlers are RxJS pipelines** that return the observable — never
   `async` / `await`. `from(...)` at every Promise boundary (HTTP, Dexie), compose with
   `switchMap`/`concatMap`/`mergeMap`/`tap`, `catchError` not `try/catch`, `finalize` not
   `try/finally`. Canon: `src/state/offline-reports/offline-reports.state.ts`.
8. **No hardcoded brand color, ever** — no hex, no `#`, no ad-hoc RGB. The palette is the
   runtime tenant brand (below).
9. **No hard deletes** (root fork rule) — soft delete only, everywhere in the stack.
10. **Never fail silently offline.** Every path that needs the network states what the
    technician must do ("conéctate una vez para…"). A blank screen is a bug.

## Structure — where things go

| What | Where |
|---|---|
| Pages | `src/app/<feature>/pages/<page>/` |
| Feature components | `src/app/<feature>/components/<thing>/` |
| Cross-feature widgets | `src/app/shared/components/<thing>/` |
| Interfaces / DTOs | `src/app/data/dtos/<resource>/` |
| Enums + unions | `src/app/data/types/<resource>/` |
| Constants | `src/app/data/constants/` |
| Shared validators | `src/app/validators/<name>.validator.ts` |
| Shared helpers | `src/app/data/utils.ts` |
| HTTP services | `src/http/<resource>.service.ts` (one per resource) |
| NGXS state | `src/state/<resource>/` (`.state.ts` + `.actions.ts`) |
| Offline / Dexie | `src/offline/` |
| PrimeNG overrides | `src/theme/<component>.scss`, imported in `src/theme/_index.scss` |

Features today: `auth`, `customers`, `reports`, `users`, `visits`.

**Enums are real TS enums**, one per file, string-valued — compare `x === Enum.Member`.
Never a const-array union. Never expose an enum on a component just so the template can
read it (`protected readonly Status = Status` is banned) — derive a `computed()` boolean
instead.

**No inline function calls in templates.** `{{ formatThing(x) }}` re-runs every change
detection. Use a `computed()`, a getter, or a pure pipe in `src/app/pipes/`.

**Type declarations live in their own file** — never inline object types in a class body
or a method signature.

## HTTP services

Thin wrappers over `RemoteService` (`src/http/remote.service.ts`), which owns the base URL
and `toParams`. One class per resource, `providedIn: 'root'`, `inject()`, return
`Observable<T>`, no logic. Canon: `src/http/customers.service.ts`.

```ts
@Injectable({ providedIn: 'root' })
export class ReportTemplatesService {
  private readonly remote = inject(RemoteService);

  list(query?: ReportTemplateQuery): Observable<ReportTemplateListResponse> {
    return this.remote.get<ReportTemplateListResponse>('/report-templates', query);
  }
}
```

Never `inject(HttpClient)` in a feature service; never build a URL by hand.

## Styling

- **Palette = runtime tenant brand.** `granite` → `--brand-surface-*`; `navy` / `sky` /
  `cyan` → `--brand-primary-*`. Steps are **`0`…`1000` by 100** — there is no `-50` or
  `-950` on brand scales. Semantic tokens: `background`, `surface`, `primary`,
  `secondary`, `dark`. Tailwind's stock status scales (`amber`, `red`, `emerald`) keep
  their standard `50`…`950`.
- **Reuse the global classes in `styles.scss` before styling locally**: `.field-input`,
  `.field-label`, `.field-group`, `.btn-primary` / `-secondary` / `-neutral` / `-danger`,
  `.card`, `.card-section`. They already carry dark, disabled and focus states —
  re-implementing one in a template almost always drops one of those.
- **`.field-input` is fixed at 56px (`h-14`)** so every control shares a baseline —
  `<p-select>`, `<p-datepicker>`, `<input pInputText>`, `<p-inputnumber>` all inherit it.
  Textareas opt out with `!h-auto`. A control needing another height gets an `!h-*` in its
  theme sheet, never a parallel class.
- **Dialogs are capped `max-w-11/12`** via `styleClass` (keeps a gutter on narrow screens),
  alongside the inline pixel width for roomy viewports. Apply to every new dialog.
- Prefer `size-*` over matching `w-*`/`h-*`.

## PrimeNG 20.4

- Aura preset repointed to the brand vars in `src/app/theme/manttio-preset.ts`; it and
  `tailwind.config.js` read the same CSS vars — **keep their neutral fallbacks in sync**.
- `theme.options.cssLayer` means **override sheets in `src/theme/*.scss` win without
  `!important`**. Restyling a PrimeNG component = edit/add its sheet there and `@import` it
  in `_index.scss`. Never sprinkle overrides into component styles or templates.
- Use PrimeNG's own overlays before hand-rolling: `<p-dialog>`, `<p-confirmDialog>` +
  `ConfirmationService`, `<p-popover>` (handles outside-click, ESC and viewport
  positioning — don't rebuild it with `@HostListener('document:click')`), `<p-toast>` +
  `MessageService`. Never `alert()` or `Swal`.
- `appendTo="body"` when the trigger sits in a cramped layout context (bottom nav, table
  cell) — frees the overlay from any ancestor that later grows `overflow:hidden`.

### Dialog extraction — pick the shape by what the dialog *owns*

1. **Trivial yes/no, no form** → `ConfirmationService.confirm({...})` against the global
   `<p-confirmdialog />`. No component.
2. **Presentational shell** (renders, emits, parent dispatches) → standalone component with
   `visible = model(false)` + `output()`. Canon: `reports/components/leave-draft-dialog`,
   `reports/components/sign-submit-dialog`.
3. **Owns selection/form state + dispatch + toasts** → self-contained component under
   `<feature>/components/<thing>-dialog/` with an imperative `open(target?)`, internal
   `dialogOpen = signal(false)`, optional `output()`. Parent holds
   `private dlg = viewChild<TheDialog>('dlg');` → `this.dlg()?.open(row)`. Canon:
   `users/components/delete-user-dialog`, `shared/components/sync-pending-reports-dialog`.

For a globally-mounted dialog fired from a non-UI source, wire it through a root
`@Injectable` bridge holding a `Subject<…>` the dialog subscribes to
(`SyncDialogBridge` is the pattern).

## Lazy-loaded `<p-select>` (server-paged option lists)

For option lists that can outgrow one page. PrimeNG 20.4 Select supports
`[virtualScroll]` + `[lazy]` + `(onLazyLoad)`; the scroller drives paging off a
**pre-sized sparse array**, so the array length must equal the server's `total` before the
first render.

```html
<p-select
  [options]="options()"
  formControlName="templateId"
  optionLabel="name"
  optionValue="id"
  [virtualScroll]="true"
  [virtualScrollItemSize]="44"
  [lazy]="true"
  (onLazyLoad)="onLazyLoad($event)"
  [loading]="loading()"
  [filter]="true"
  appendTo="body"
  styleClass="field-input"
  placeholder="Selecciona una plantilla" />
```

```ts
// Page 1 establishes `total` → size the sparse array once, then fill slices in place.
onLazyLoad(event: ScrollerLazyLoadEvent): void { /* dispatch a page load for first..last */ }
```

Rules for this pattern:

- **Size once, fill in place.** Replacing the whole array on every page resets scroll.
- **`virtualScrollItemSize` must match the rendered row height** or the scrollbar drifts.
- **Offline reads the cache, not the network.** When `AppState.isOnline` is false, bind the
  full cached set and let the scroller page client-side — same component, no lazy fetch.
- **Online lazy paging does not populate the offline cache on its own.** A separate
  background pass walks every page once per session into Dexie, so a technician who only
  scrolled page 1 still has the full set in the field.

## Offline + Dexie

- One shared `OfflineDb` (`src/offline/offline.db.ts`, IndexedDB `manttio-offline`),
  injectable so every queue service shares one connection through version upgrades.
- **Version bumps are additive** — unlisted stores carry forward, so a new version declares
  only what it adds: `this.version(3).stores({ thing: 'id, updatedAt' });`. Never redeclare
  existing stores, never drop one.
- Queue/cache services are Promise-based (`src/offline/*.service.ts`); the NGXS boundary
  wraps them with `from(...)`.
- **Dexie is the source of truth for offline data** — the state that mirrors it is *not*
  added to the NGXS storage-plugin keys (`OfflineReportsState` is the precedent); a load
  action re-hydrates on boot.
- **No service-worker `dataGroups`.** `ngsw-config.json` caches no API responses; adding
  SW-level API caching would create a second, divergent mechanism. Cached data lives in
  Dexie.
- Connectivity comes from `select(AppState.isOnline)` — **never `navigator.onLine`** in a
  component or state.

## Dark mode

`<html>.app-dark` is the single source of truth — Tailwind (`darkMode: ['class',
'.app-dark']`) and PrimeNG (`darkModeSelector`) both read it. State at `AppState.darkMode`,
persisted; toggled with `SetDarkMode`. Never add a parallel toggle.

Global classes handle themselves. When a template hardcodes a raw color, pair it:

| Light | Dark |
|---|---|
| `bg-background` (page) | `dark:bg-granite-1000` |
| `bg-white` (cards) | `dark:bg-granite-900` |
| `bg-granite-0` | `dark:bg-granite-900` |
| `bg-sky-0` / `bg-amber-50` / `bg-red-50` / `bg-emerald-50` | `dark:bg-sky-1000/40` / `dark:bg-amber-950/30` / `dark:bg-red-950/30` / `dark:bg-emerald-950/30` |
| `text-granite-1000` (titles) | `dark:text-granite-0` |
| `text-granite-900` / `-800` | `dark:text-granite-100` / `-200` |
| `text-granite-700` / `-600` / `-500` (muted) | `dark:text-granite-300` / `-400` / `-400` |
| `text-sky-800` / `-700` (accent) | `dark:text-sky-300` |
| `border-granite-200` / `-300` | `dark:border-granite-700` |

**Leave alone in dark mode:** status pills (`bg-amber-100 text-amber-900` etc. — vibrant in
both by intent) and the signature canvas / `<img>` (a dark canvas hides black strokes).

## Forms + interactive state

- **Reactive Forms** (`FormBuilder` + `formControlName`) for any form group — not
  `[(ngModel)]`.
- **Bind `[disabled]="form.invalid"`** on submit buttons, or the `.btn-*`
  `disabled:opacity-50` styling never fires.
- **Default controls to `Validators.required`** unless explicitly optional. An empty form
  should disable submit out of the box.
- Wrap hover/active with the **`enabled:` modifier** (`enabled:hover:bg-sky-800`) so a
  disabled button doesn't tint on hover.
- **Never render a value in a disabled input.** Read-only data is text / display rows
  (`report-view` style). `form.disable()` is not a read-only UI.
- **Show backend errors verbatim** — toast detail is `errorMessage(err, fallback)`, never
  copy conditioned on a status code.

## Motion

CSS/Tailwind transitions only — `transition-opacity duration-300`, `[class.opacity-0]`,
etc. **anime.js is not installed in this app and must not be added**; neither are Angular
animations (`@angular/animations` is not a dependency). Keep motion brief and purposeful,
never decorative.

## Layout & responsive

Phone-first. Section grids resolve **desktop column counts down to one column on small
screens** — and only through **static class strings** (Tailwind's JIT cannot see
`lg:grid-cols-${n}`):

| columns | classes |
|---|---|
| 1 | `grid-cols-1` |
| 2 | `grid-cols-1 md:grid-cols-2` |
| 3 | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` |

One helper owns that mapping — it is the seam any future per-breakpoint override extends.

`AuthenticatedLayoutAdmin` resets the inner `<main>`'s `scrollTop` on `NavigationEnd`; the
scrollable is `<main>`, not `window`, so router `scrollPositionRestoration` doesn't reach
it. Don't add a competing scroll reset.

## Shared helpers (`src/app/data/utils.ts`)

Reuse before re-implementing; add new general-purpose helpers here **and** to the list in
`frontend/CLAUDE.md`.

- **`toParams(q?)`** → `HttpParams`, skipping `undefined`/`null`/empty. Every query goes
  through it.
- **`errorMessage(err, fallback)`** → human-readable string from an `HttpErrorResponse`,
  `Error`, or anything else.
- **`dataUrlToFile(dataUrl, filename, mime?)`** / **`urlToDataUrl(url)`** — round-trip
  images through IndexedDB.

## Checklist (before closing any field-app task)

- [ ] No barrel file, no inline styles, no arbitrary Tailwind values, no hex colors
- [ ] `inject()`, `@if`/`@for`, signals + `select(...)`, no template method calls
- [ ] Any `@Action` is an RxJS pipeline returning the observable — no `async`/`await`
- [ ] Global classes reused; new PrimeNG restyling went to `src/theme/*.scss`
- [ ] Dark-mode pairing added for every raw color introduced
- [ ] Submit button binds `[disabled]="form.invalid"`; read-only data is text, not disabled inputs
- [ ] Renders and is usable at 360px wide, one column
- [ ] Offline path considered: works from cache, or states what the technician must do
- [ ] `npm run build` green in `frontend/`

> **Package manager: `frontend/` is npm** (`package-lock.json`) — `npm ci` / `npm run build`.
> Only `backend/` uses pnpm. Running `pnpm install` here generates a competing
> `pnpm-lock.yaml`; never commit one.
