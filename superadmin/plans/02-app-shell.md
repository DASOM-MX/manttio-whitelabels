# 02 — App shell

> **Status:** not-started
> **Owner:** — · **Last updated:** 2026-07-05

The platform layer every module plugs into: build setup, auth gate, layout, navigation,
theming, HTTP plumbing. **This is the current PR's branch (`feature/superadmin-UI-shell`).**
No module agent starts until CP-3 here is done.

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
- `access.ts` (shared): the matrix as data + `hasRole`/`hasModule` helpers — the one place
  gating logic lives (route data, nav filter, and `@if`s all consume it). This is the file
  that makes the future SSR move cheap.
- Port the frontend's scroll-reset behavior: the scrollable is the inner `<main>`, reset
  `scrollTop` on every `NavigationEnd`.

## 5. Theming port (from `frontend/`)

Copy, don't reinvent — keep byte-parity where possible. (Deliberate exceptions, all in
01: **typography** — Commissioner, not Inter; **control density** — `.field-input`
`h-12`, not `h-14`; **icons** — lucide-angular outlined, not PrimeIcons; plus the
borders-not-shadows surface chrome from the Design language.)

- `tailwind.config.js` — palette scales (`granite`/`navy`/`sky`/`cyan`), semantic tokens,
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
- [ ] SSR scaffold stripped (per §2); plain browser build, `dist/superadmin/browser/`
- [ ] Zoneless change detection enabled
- [ ] NGXS installed (`@ngxs/store@^21` + `@ngxs/storage-plugin@^21`, per §2)
- [ ] Tailwind 3.4 wired into the build
- [ ] `npm run build` green

### CP-2 — Theming + conventions port
- [ ] `tailwind.config.js` ported (palette, semantic tokens, dark class, max-w-11/12)
- [ ] **Commissioner Variable** self-hosted (`@fontsource-variable/commissioner`,
      preloaded) + `sans`/`data` stacks per 01 Typography; tnum check on a sample
      numeric column (fallback: Atkinson Hyperlegible for `data`)
- [ ] **`lucide-angular`** installed + icon conventions wired (outlined-only, stroke-2,
      `size-4`/`size-5` — 01 Design language); no PrimeIcons in own templates
- [ ] **`shared/motion.ts`**: MOTION tokens (150/220/320ms), easings, stagger helper,
      `prefers-reduced-motion` guard; route-enter animation on the layout
- [ ] Global classes ported at the **compact scale**: `.field-input` = `h-12`
      (superadmin deviation, 01), compact opt-down `!h-10`; borders-not-shadows card
      chrome
- [ ] `styles.scss` globals ported
- [ ] `manttio-preset.ts` + PrimeNG providers (Aura, cssLayer, darkModeSelector)
- [ ] `src/theme/_index.scss` + initial override sheets
- [ ] `AppState` dark mode toggle working end-to-end (persisted, `<html>.app-dark`)
- [ ] `data/utils.ts` helpers ported

### CP-3 — Auth + gated layout (gate for module agents)
- [ ] `AuthState` + login page (**two-panel 60/40 spec, §3**: brand panel w/ dark
      primary bg, clean email+password form, contact-admin reset disclaimer) +
      interceptor (401 redirect) + `authGuard`
- [ ] `/auth/me` on boot + post-login → `AuthState`; splash until resolved
- [ ] Forced-change dialog (`mustChangePassword`, §3): unskippable modal →
      `POST /auth/password` → into the shell
- [ ] `access.ts` matrix + central `canMatch` guard reading route `data`
- [ ] `AuthenticatedLayout`: sidebar/topbar, mobile drawer, scroll reset, **nav filtered
      by config + role** (verify technician sees only My reports / My warehouse /
      Stock lookup)
- [ ] Lazy route stubs for all module areas (branding, cms, users, reports, templates,
      billing, customers + equipment, contracts, calendar, wms) with
      `data: { module, roles }` declared
- [ ] Global toast + confirm dialog mounted; 403 toast handling
- [ ] A11y shell infrastructure: skip-to-content link, global `:focus-visible` ring,
      one-h1-per-page pattern, `min-h-dvh` layout, container max-width constant
      (01 Accessibility + Layout & responsive)
- [ ] `public/_redirects` SPA catch-all
- [ ] Build green; manual pass: login as each role → nav matches the matrix

## Open decisions / asks
- ~~NGXS-on-Angular-21 compat~~ — **resolved 2026-07-05:** NGXS v21 supports Angular 21;
  pin `@ngxs/*@^21` (see §2).
- ~~SSR vs CSR~~ — **resolved 2026-07-05: CSR now, SSR when client volume justifies it**
  (upgrade path in `14-access-control.md` §5).
- Backend asks (recorded for backend planning): superadmin login endpoint,
  `GET /auth/me` returning `{ user, role, tenantConfig }`, `role` enum
  `owner|admin|office|technician` on users, per-tenant `modules` config in the manager
  push schema; `mustChangePassword` on `/auth/me` + `POST /auth/password` (change own,
  clears the flag — §3 forced-change flow). **Explicitly not needed in v1:**
  forgot-password / reset-email endpoint — resets go through the owner via the users
  module (§3 login spec).
