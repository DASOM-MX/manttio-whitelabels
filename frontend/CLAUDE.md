# Web-app rules

## Project state (as of 2026-06-01)
- **Angular 20** standalone-components app, zoneless change detection, esbuild via `@angular/build`.
- **State:** NGXS 20 — `Auth`, `App` (connectivity + dark mode), `Users`, `Customers`, `Reports`, `ReportDraft`, `OfflineReports`. `auth`, `reportDraft`, and `app` are persisted via the storage plugin.
- **Backend:** Hono on Cloudflare Workers + Neon Postgres (in `/backend`). Frontend talks to it via the `apiUrl` env value; local override goes in `environment.development.ts` and is intentionally not committed.
- **Auth:** JWT in NGXS; guards check token presence only (no frontend JWT decoding), the interceptor handles 401s, backend is the sole authority on token validity.
- **Offline:** report capture queues into IndexedDB (Dexie), syncs through `OfflineReportsState` when connectivity returns. PWA shell registered via `provideServiceWorker('ngsw-worker.js')`, manifest + icons live in `public/`.
- **PWA / hosting:** SPA on Cloudflare Pages, root dir `frontend/`, output `dist/manttio/browser/`, SPA catch-all in `public/_redirects`.
- **Theming:** PrimeNG **Aura preset** with the manttio palette (`src/app/theme/manttio-preset.ts`); per-component overrides in `src/theme/*.scss`; dark mode is real (Tailwind + PrimeNG) and persisted.

## Styling
- Use **Tailwind CSS 3.4 only**. Do not upgrade or downgrade. If a new utility/class is needed, add it to `tailwind.config.js` (extend `theme`) rather than using arbitrary values inline.
- Prefer `size-*` over paired `w-*`/`h-*` when width and height are equal (e.g. `w-4 h-4` → `size-4`).
- **Never** use inline `style="..."` attributes (or `[style]` / `[ngStyle]`) in Angular templates. All styling goes through Tailwind classes or component-scoped styles (`styles` / `styleUrls` on the component, or the component's `.css` file).
- The color palette is shared with the marketing site (`/website`). Use the `granite`, `navy`, `sky`, and `cyan` scales or the semantic tokens (`background`, `surface`, `primary`, `secondary`, `dark`) — do not introduce new ad-hoc hex values.
- **Reuse global classes from `styles.scss`** before re-styling locally: `.field-input` (form controls), `.field-label`, `.field-group`, `.btn-primary` / `-secondary` / `-neutral` / `-danger`, `.card`, `.card-section`. They already carry dark variants and disabled/focus states; re-implementing them in templates almost always misses one of those.
- `.field-input` is **fixed at 56px** (`h-14`) so every form control snaps to the same baseline — `<p-select>`, `<p-datepicker>`, `<input pInputText>`, `<p-inputnumber>` all inherit it. Textareas opt out via `!h-auto`; the paginator's compact rows-per-page select and the dropdown filter input opt down to `!h-11`. If a new control needs a non-standard height, add an `!h-*` override in its component theme sheet rather than introducing a parallel class.

## Angular
- Always use the **`inject()`** function for dependency injection — never constructor-parameter injection. Declare each dependency as a class field: `private http = inject(HttpClient);`. Do not write `constructor(private http: HttpClient) {}`.
- Prefer **Reactive Forms** (`FormBuilder` + `FormGroup` + `formControlName`) over template-driven `[(ngModel)]` for any form group.
- Use the **new built-in control flow syntax** in templates: `@if`, `@else if`, `@else`, `@for (item of items; track item.id) { }`, `@switch / @case / @default`. Do not use `*ngIf`, `*ngFor`, `*ngSwitch`, `*ngSwitchCase`, `*ngSwitchDefault`, `[ngIfElse]`, or `<ng-template>`-based fallbacks. When migrating, also drop `CommonModule` imports if `@if`/`@for`/`@switch` are the only directives used.
- Prefer **signals (`signal`, `computed`)** over plain class properties for any reactive component state. For NGXS state, use the top-level **`select(...)`** function imported from `@ngxs/store` (e.g. `reports = select(ReportsState.list);`) — never `this.store.selectSignal(...)`. Both return `Signal<T>`; `select(...)` is terser and avoids needing a `Store` injection just to read state (still `inject(Store)` for `store.dispatch(...)`). Templates call signals as functions (`{{ total() }}`) — do not wrap with `async`. Plain non-reactive constants (option lists, fixed enums) can stay as regular fields.
- Inside NGXS `@Action` handlers, write the body as an **RxJS pipeline** and return the observable — do **not** mark the handler `async` and `await` Promises. Wrap any Promise-returning dependency (HTTP client, IndexedDB / Dexie, etc.) at the boundary with `from(...)` and compose with `switchMap` / `concatMap` / `mergeMap` / `tap` / `catchError` / `finalize`. Sequence multiple actions with `switchMap`, not `await firstValueFrom(this.store.dispatch(...))` — `store.dispatch(...)` already returns an `Observable`. Use `finalize` (not `try/finally`) for cleanup like clearing an in-flight flag, and `catchError` (not `try/catch`) for per-item failure handling that should not abort the rest of the run. NGXS subscribes to the returned observable the same way it does a Promise, so `ofActionSuccessful` / `ofActionErrored` semantics are preserved. See `src/state/offline-reports/offline-reports.state.ts` for the canonical shape.

## PrimeNG
- PrimeNG **20.4** in styled mode with the Aura preset customized to the manttio palette (`primary` = sky scale, `surface` = granite scale). The preset lives in `src/app/theme/manttio-preset.ts`; if the palette tweaks in `tailwind.config.js`, keep the preset in sync so Tailwind utilities and PrimeNG component chrome stay visually consistent.
- `theme.options.cssLayer: { name: 'primeng' }` puts Aura's CSS into a named layer, so **per-component override sheets in `src/theme/*.scss` win** by spec without any `!important`. When restyling a PrimeNG component, edit its sheet there and `@import` it in `src/theme/_index.scss` — don't sprinkle overrides in component styles or templates.
- Reach for PrimeNG's own components for overlays/feedback before hand-rolling: **`<p-dialog>`** for modals, **`<p-confirmDialog>`** + `ConfirmationService` for confirmations, **`<p-popover>`** for popover menus (it handles outside-click + ESC + viewport-aware positioning out of the box — don't reinvent it with `@HostListener('document:click')`), **`<p-toast>`** + `MessageService` for notifications. Never `Swal` or `alert()`.
- For `<p-popover>` / `<p-dialog>` content, **use `appendTo="body"`** when the trigger is inside a small layout context (e.g. the bottom-nav `<li>`) — that frees the overlay from any ancestor that grows an `overflow:hidden` or `transform` later.
- Components without an override sheet today (`<p-checkbox>`, `<p-tag>`) fall back to Aura's chrome via the cssLayer config; that's usually fine but if one looks off, add a `src/theme/<component>.scss` rather than working around it inline.
- **Dialog extraction:** there are three shapes here, pick the one that matches what the dialog *owns*. (1) For a trivial yes/no confirm with no form, use `ConfirmationService.confirm({...})` against the global `<p-confirmdialog />` — no component to write. (2) For a presentational shell (renders content, forwards events, parent owns the dispatch), keep it as a standalone component with `visible = model(false)` + `output()` events — `reports/components/leave-draft-dialog` and `reports/components/sign-submit-dialog` are the canonical examples. (3) For a dialog that owns a reactive form + NGXS dispatch + Actions stream + toasts, extract it as a self-contained component under `<feature>/components/<thing>-dialog/` with an imperative `open(target)` API, internal `dialogOpen = signal(false)`, and an optional `output()` for parent-side reactions — `users/components/delete-user-dialog` is the canonical example. The parent holds it via `private dlg = viewChild<TheDialog>('dlg');` and triggers with `this.dlg()?.open(row)`. Don't bake business-logic dispatch into the presentational shape, and don't pull form/state into the page when the heavier shape is a better fit.

## Dark mode
- `<html>.app-dark` is the **single source of truth** — Tailwind (`darkMode: ['class', '.app-dark']` in `tailwind.config.js`) and PrimeNG (`darkModeSelector: '.app-dark'` in the Aura preset config) both read from it. Don't introduce a parallel toggle.
- State lives at `AppState.darkMode`, persisted via the NGXS storage plugin (`'app'` key). Toggle with `store.dispatch(new SetDarkMode(...))`, read with `select(AppState.darkMode)`. The `App` root component mirrors it onto `<html>` via an `effect()`.
- Global classes already handle dark mode (`.field-input`, `.btn-*`, `.card`, `.card-section`, html/body bg + text). When a **template hardcodes a raw color**, pair the light token with its dark variant inline. Standard pairings:

  | Light | Dark |
  |---|---|
  | `bg-background` (page bg) | `dark:bg-granite-950` |
  | `bg-white` (cards/panels) | `dark:bg-granite-900` |
  | `bg-granite-50` | `dark:bg-granite-900` |
  | `bg-sky-50` / `bg-amber-50` / `bg-red-50` / `bg-emerald-50` (soft accent panels) | `dark:bg-sky-950/40` / `dark:bg-amber-950/30` / `dark:bg-red-950/30` / `dark:bg-emerald-950/30` |
  | `text-granite-950` (titles) | `dark:text-granite-50` |
  | `text-granite-900` | `dark:text-granite-100` |
  | `text-granite-800` | `dark:text-granite-200` |
  | `text-granite-700` / `-600` / `-500` (muted) | `dark:text-granite-300` / `-400` / `-400` |
  | `text-sky-800` / `-700` (accent labels) | `dark:text-sky-300` |
  | `border-granite-200` / `-300` | `dark:border-granite-700` |

- Leave **status pills** (`bg-amber-100 text-amber-900`, `bg-emerald-100 text-emerald-900`, etc.) and the **signature canvas / `<img>`** unchanged in dark mode — pills are intentionally vibrant in both modes, and a dark canvas would hide the black signature strokes.

## Forms + interactive state
- Bind **`[disabled]="form.invalid"`** on submit buttons so the `.btn-*` `disabled:opacity-50 disabled:cursor-not-allowed` styling actually fires. Without the binding, the visual disabled state never appears even when the form is empty.
- In `dynamic-form` and similar config-driven builders, default form controls to **`Validators.required`** unless the field is explicitly optional. An empty form should disable submit out of the box.
- Wrap hover/active state changes with the **`enabled:` modifier** (e.g. `enabled:hover:bg-sky-800 enabled:active:bg-sky-900`) on any `.btn-*` variant so a disabled button doesn't flash a darker tint on hover. The `.btn-*` global classes already do this — match the pattern when adding new buttons.

## Animations
- Use **anime.js** for animations only. Do not use it as a general utility library.
- Do not animate via CSS keyframes, Angular animations, or other libraries unless explicitly requested.

## Shared helpers (`src/app/data/utils.ts`)
Reuse these instead of re-implementing locally. When you add a new general-purpose helper that doesn't belong in a feature folder, put it here and add a one-line entry below.

- **`toParams(q?: Query): HttpParams | undefined`** — build an `HttpParams` from a plain `Record<string, string | number | boolean | undefined | null>`, skipping `undefined`/`null`/empty entries. Use for any service that calls `this.http.get(url, { params: toParams({...}) })`.
- **`errorMessage(err: unknown, fallback: string): string`** — extract a human-readable message from a thrown value. Tries `err.error.message` (Angular `HttpErrorResponse` shape) first, then `Error.message`, then returns `fallback`. Use anywhere you `catch (err)` and need a string to show the user or persist as `lastError`.
- **`dataUrlToFile(dataUrl, filename, mime?)`** / **`urlToDataUrl(url)`** — convert between base64 data URLs and `File` blobs. Used by the offline reports pipeline to round-trip images through IndexedDB.
