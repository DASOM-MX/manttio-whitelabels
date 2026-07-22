# 02 — App shell

> **Status:** done
> **Owner:** branch `feature/superadmin-app-shell` · **Last updated:** 2026-07-06

The platform layer every module plugs into: build setup, auth gate, layout, navigation,
theming, HTTP plumbing. **Implemented on `feature/superadmin-app-shell`** (the old
`feature/superadmin-UI-shell` branch predates the plan-suite move and holds only docs).
No module agent starts until CP-3 here is done — **CP-3 is done.**

---

## 1. Current scaffold state

`ng new` Angular 21.2 default: SSR + express (`server.ts`, `main.server.ts`,
`app.config.server.ts`, `app.routes.server.ts`), hydration, empty `routes`, vitest + jsdom,
prettier. No Tailwind, no PrimeNG, no NGXS, no zoneless config.

## 2. Platform decisions

- **CSR for now — decided 2026-07-05** (final position after weighing SSR gating). Feature
  blocking by config + role happens client-side via a boot-time `/auth/me` (§3), with the
  backend as the real authority. We **move to SSR later** as client volume grows — the
  upgrade path and what it changes are recorded in `14-access-control.md` §5; the shell's
  job now is to keep all gating logic centralized (`access.ts`) so that flip stays
  mechanical.
- **Strip the SSR scaffold:** remove `@angular/ssr`, `express`, `server.ts`,
  `main.server.ts`, `app.config.server.ts`, `app.routes.server.ts`, hydration provider,
  and the `serve:ssr` script; plain browser build, output `dist/superadmin/browser/`.
  (`ng add @angular/ssr` regenerates all of it cleanly when the time comes — dormant
  server code would only rot.)
- **Zoneless** change detection (`provideZonelessChangeDetection()`), matching frontend.
- **NGXS** for state — **decided 2026-07-05**. Compat verified: NGXS v21 peers on
  `@angular/core >=21 <22`, so install **`@ngxs/store@^21` + `@ngxs/storage-plugin@^21`**
  (do *not* take v22 — it requires Angular 22). Superadmin stays on Angular 21.
- **Hosting:** Cloudflare Pages SPA, same as frontend — `public/_redirects` catch-all,
  root dir `superadmin/`, output `dist/superadmin/browser/`.
- **Environments:** `environment.ts` / `environment.development.ts` with `apiUrl`; the dev
  file's live-API override stays local-only (same `skip-worktree` convention as frontend —
  see root `CLAUDE.md`).

## 3. Auth + gating input (see `14-access-control.md`)

- **JWT in NGXS, frontend parity:** token stored in `AuthState` (persisted), interceptor
  attaches `Authorization`, handles 401 → login redirect. **No frontend JWT decoding** —
  role never comes from the token.
- **`GET /auth/me` → `{ user, role, tenantConfig }`** fetched right after login and on app
  boot (when a token exists); stored in `AuthState`. This is the **single gating input**
  for nav, guards, and in-page `@if`s. Until it resolves, the shell shows a splash — no
  gated UI is rendered from stale/absent data.
- Guards: `authGuard` (token presence) on the layout shell + one central `canMatch` guard
  reading route `data: { module, roles }` against `AuthState`. Backend enforces every call
  regardless of what the UI shows.
- **Login page (`auth/pages/login/`) — two-panel layout (60% / 40%), decided 2026-07-05:**
  - **Left panel (60%) — the form.** Clean and minimal: email + password only
    (`.field-input` h-12, password visibility toggle per 01 Forms & feedback), one
    primary submit with busy state, inline error on 401. **No social login, no
    self-serve password reset.** Below the form, a quiet disclaimer
    (copy: *"Si perdió su contraseña, contacte al administrador principal."*). Reset mechanics
    live in the users module (05), role-hierarchy-gated (owner resets admins;
    owner/admin reset office/techs — `14-access-control.md` §2 note 1); **no
    forgot-password flow or endpoint exists in v1.**
  - **Right panel (40%) — brand.** Business (tenant) logo + app name over a **dark
    brand-primary background** (deep primary step, e.g. `primary-950`, from the boot
    `GET /brand` CSS vars — manttio fallback until the fetch lands). This is the
    pre-auth branded surface §5 refers to. Static background — no animated gradients
    (01 no-AI-slop rule).
  - **Responsive:** side-by-side ≥ `lg`; below that the brand panel collapses to a
    compact logo + name header above the centered form (no dead half-screen on mobile).
  - Flow: credentials → token → `/auth/me` → enter shell.
- **Forced password change (decided 2026-07-05):** password resets and new accounts
  issue a **temporary password** (05 §2). `/auth/me` returns `mustChangePassword`; when
  true, the shell interposes an **unskippable set-your-own-password dialog** right after
  login, before any gated UI — modal, focus-trapped, **no close/escape** (deliberate,
  documented exception to the 01 `escape-routes` rule; logout is the only other exit).
  Submits to `POST /auth/password` (new + confirm, same validators as login), clears the
  flag, continues into the shell. Shell-level because every role hits it.

## 4. Layout + navigation

- `AuthenticatedLayout` component: fixed sidebar (desktop) / drawer (mobile) + topbar with
  dark-mode toggle + user menu (logout).
  **Chrome redesign (owner, 2026-07-21 — supersedes the CP-2 hairline chrome + `max-w-7xl`
  cap recorded below):** the sidebar shares the page background and separates from the
  content via a smooth neutral shadow (`.shell-sidebar`); the topbar is its own card-tone
  strip (`.shell-topbar`) so the two chrome pieces read as distinct surfaces; active nav =
  solid brand-primary block + light neutral shadow (`.nav-active`, `.nav-group-active`
  tint for parents); the main container is full-width. Canon lives in 01 → Design
  language + the `superadmin-design` skill.
- Sidebar renders **only the entries `(tenantConfig, role)` allow** — matrix in
  `14-access-control.md` §2. Full nav (owner/admin): **Dashboard** · **Calendar** ·
  **Users** · **Reports** · **Plantillas** (`/templates` — report-template builder,
  owner/admin only, `06-reports.md` §5) · **Billing** · **Clients** (nested: All / Leads / Blacklist /
  Equipment) · **Contracts** · **Marca** (branding — always visible, no config flag;
  owner edits, admin read-only) · **CMS** (Contenido / Clientes — behind the `cms`
  flag) · **Warehouse**. Technician nav is exactly:
  **Calendar** (my visits + team read-only) · **My reports** · **My warehouse** ·
  **Stock lookup**.
- Routes are **lazy per feature** (`loadChildren` per module folder) so module agents ship
  independently; every route declares `data: { module, roles }`.
- **Dashboard — the shell owns it (decided 2026-07-05).** No separate module/plan: the
  shell ships `dashboard/pages/dashboard/` as the **default landing route** for
  owner/admin/office — a stub with a quiet empty state and **card-slot regions** that
  other modules fill from their own plans (08: lead-source counts card; 12: today's
  visits card; future cards register the same way). Roles: owner/admin/office;
  technicians never see it — their default landing route is **Calendar**. Matrix row
  in `14-access-control.md` §2.
- `access.ts` (shared): the matrix as data + `hasRole`/`hasModule` helpers — the one place
  gating logic lives (route data, nav filter, and `@if`s all consume it). This is the file
  that makes the future SSR move cheap.
- Port the frontend's scroll-reset behavior: the scrollable is the inner `<main>`, reset
  `scrollTop` on every `NavigationEnd`.

## 5. Theming port (from `frontend/`)

Copy, don't reinvent — keep byte-parity where possible. (Deliberate exceptions, all in
01: **typography** — Quicksand (owner 2026-07-22; Commissioner before that), not Inter; **control density** — `.field-input`
`h-12`, not `h-14`; **icons** — lucide-angular outlined, not PrimeIcons; plus the
borders-not-shadows surface chrome from the Design language.)

- `tailwind.config.js` — palette scales (originally `granite`/`navy`/`sky`/`cyan`;
  renamed to semantic `primary`/`surface` + tombstones by plan 16's superadmin leg,
  2026-07-21), semantic tokens,
  `darkMode: ['class', '.app-dark']`, `max-w-11/12` extension. **Whitelabel twist
  (decided 2026-07-05):** primary + surface scales resolve through **CSS variables** set
  at boot from the public `GET /brand` fetch (manttio values as fallbacks), and the shell
  applies the brand's PrimeNG preset update in the same step — the login screen already
  shows tenant logo + colors. Brand model + editor: `03-branding.md` §2–4.
- `src/styles.scss` — global classes (`.field-input`, `.field-label`, `.field-group`,
  `.btn-*`, `.card`, `.card-section`) + html/body bg/text with dark variants.
- `src/app/theme/manttio-preset.ts` — Aura preset (primary=sky, surface=granite,
  `cssLayer: 'primeng'`, `darkModeSelector: '.app-dark'`).
- `src/theme/*.scss` + `_index.scss` — start with the sheets superadmin needs on day one
  (table, select, datepicker, dialog, paginator); pull others as modules need them.
- `AppState` (`darkMode` + connectivity), storage-plugin persisted; root `App` mirrors
  dark mode onto `<html>` via `effect()`.

## 6. Shared plumbing

- `src/app/data/utils.ts` — port `toParams`, `errorMessage`.
- Global `<p-toast>` + `<p-confirmdialog>` mounted once in the layout.
- `src/http/` skeleton + a typed `PagedResponse<T>` DTO for all list endpoints.
- 403 handling: interceptor surfaces a standard toast and stays on page (config/role can
  change under a live session — `14-access-control.md` §4).

---

## Checkpoints

### CP-1 — Platform reset
- [x] SSR scaffold stripped (per §2); plain browser build, `dist/superadmin/browser/`
- [x] Zoneless change detection enabled
- [x] NGXS installed (`@ngxs/store@^21` + `@ngxs/storage-plugin@^21`, per §2)
- [x] Tailwind 3.4 wired into the build (postcss.config.js, palette via brand CSS vars)
- [x] `npm run build` green (896 kB initial, within budget)

### CP-2 — Theming + conventions port
- [x] `tailwind.config.js` ported (palette, semantic tokens, dark class, max-w-11/12; sky/granite resolve through `--brand-primary-*`/`--brand-surface-*` CSS vars with manttio fallbacks — §5 whitelabel twist)
- [x] **Commissioner Variable** self-hosted (`@fontsource-variable/commissioner`)
      + `sans`/`data` stacks per 01 Typography; **tnum check done 2026-07-06:
      Commissioner tnum is a no-op → fallback taken, `font-data` heads with
      Atkinson Hyperlegible (tnum verified tabular by measurement)**
- [x] **`@lucide/angular`** installed (maintained successor of `lucide-angular`) +
      icon conventions wired (outlined-only, stroke-2, `size-4`/`size-5` — 01 Design
      language); no PrimeIcons anywhere (not even the CSS import)
- [x] **Motion system** (revised 2026-07-06 — Angular `animate.enter`/`animate.leave`
      + `src/animations.scss`, no anime.js): tokens as CSS custom properties
      (150/220/320ms), easings, `.anim-stagger` (30ms cap 8),
      `prefers-reduced-motion` guard; route-enter animation replayed by the layout
- [x] Global classes ported at the **compact scale**: `.field-input` = `h-12`
      (superadmin deviation, 01), compact opt-down `!h-10`; borders-not-shadows card
      chrome; `.micro-label`, `.skip-link`, `.nav-active` added
- [x] `styles.scss` globals ported
- [x] `manttio-preset.ts` + PrimeNG providers (Aura via `@primeuix/themes`, cssLayer, darkModeSelector)
- [x] `src/theme/_index.scss` + override sheets (inputtext, password, textarea, inputnumber, select, datepicker, checkbox, button, tag, table+paginator, dialog, toast, popover)
- [x] `AppState` dark mode toggle working end-to-end (persisted, `<html>.app-dark`)
- [x] `data/utils.ts` helpers ported (`toParams`, `errorMessage`)

### CP-3 — Auth + gated layout (gate for module agents)
- [x] `AuthState` + login page (**two-panel 60/40 spec, §3**: brand panel w/ dark
      primary bg, clean email+password form, contact-admin reset disclaimer) +
      interceptor (401 redirect) + `authGuard`
- [x] `/auth/me` on boot + post-login → `AuthState`; splash until resolved (only `auth.token` persists — `me` refetched every boot)
- [x] Forced-change dialog (`mustChangePassword`, §3): unskippable modal →
      `POST /auth/password` → into the shell
- [x] `access.ts` matrix + central `canMatch` guard reading route `data` (guards short-circuit when no token so anonymous hits reach /login)
- [x] `AuthenticatedLayout`: sidebar/topbar, mobile drawer, scroll reset, **nav filtered
      by config + role** (verified: technician sees exactly Calendario / Mis reportes /
      Mi almacén / Consulta de stock; drops Calendario without `scheduling`)
- [x] Dashboard stub page (`dashboard/pages/dashboard/`, §4): empty state + card-slot
      regions; default landing route owner/admin/office (technicians land on Calendar,
      or Reports when the tenant lacks `scheduling`)
- [x] Lazy route stubs for all module areas (branding, cms, users, reports, templates,
      billing, customers + equipment, contracts, calendar, wms) with
      `data: { module, roles }` declared
- [x] Global toast + confirm dialog mounted; 403 toast handling
- [x] A11y shell infrastructure: skip-to-content link, global `:focus-visible` ring,
      one-h1-per-page pattern, `h-dvh` layout w/ inner `<main>` as the single scroll
      region, container max-width `max-w-7xl` (01 Accessibility + Layout & responsive)
- [x] `public/_redirects` SPA catch-all
- [x] Build green; role pass done headlessly 2026-07-06 (Playwright vs a mock
      backend): 19/19 — anonymous redirect, 401 inline error, per-role landing
      routes, nav matrix for owner/admin/office/technician, config-flag hiding
      (billing/cms/wms off), direct-URL bounces, forced-password dialog
      (appears, ESC blocked, submit clears)

## Open decisions / asks
- **Zoneless fallback (user call, 2026-07-06):** stay zoneless (frontend parity;
  signals + PrimeNG 21 update correctly — the only timing artifacts seen were
  test-harness races, not UI defects). **If real update gaps appear in usage,
  reintroducing the Angular zone is sanctioned**: add the `zone.js` polyfill to
  `angular.json` + swap `provideZonelessChangeDetection()` for
  `provideZoneChangeDetection()` in `app.config.ts` — confined to the shell,
  no component changes needed.
- ~~NGXS-on-Angular-21 compat~~ — **resolved 2026-07-05:** NGXS v21 supports Angular 21;
  pin `@ngxs/*@^21` (see §2).
- ~~SSR vs CSR~~ — **resolved 2026-07-05: CSR now, SSR when client volume justifies it**
  (upgrade path in `14-access-control.md` §5).
- Backend asks (recorded for backend planning): superadmin login endpoint,
  `GET /auth/me` returning `{ user, role, tenantConfig }`, `role` enum
  `owner|admin|office|technician` on users, per-tenant `modules` config in the manager
  push schema; ~~`mustChangePassword` + `POST /auth/password`~~ — **shipped 2026-07-09**
  (§3 forced-change flow): `must_change_password` column (migration `0012`), flag rides
  the **login response** and `PublicUser` (`/auth/me` itself still pending with
  tenantConfig), `POST /auth/password` (change own, new password only — matches the
  shipped dialog contract) clears it. **Explicitly not needed in v1:**
  forgot-password / reset-email endpoint — resets go through the owner via the users
  module (§3 login spec).
