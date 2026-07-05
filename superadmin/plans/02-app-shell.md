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

- **Drop SSR.** Authed admin, zero SEO value. Remove `@angular/ssr`, `express`, the
  `server.ts`/`*.server.ts` files, hydration provider, and the `serve:ssr` script; switch
  `angular.json` to plain browser build with output `dist/superadmin/browser/`.
- **Zoneless** change detection (`provideZonelessChangeDetection()`), matching frontend.
- **NGXS** for state, matching frontend patterns. ⚠️ Verify NGXS ↔ Angular 21 peer compat
  first (frontend pins NGXS 20 on Angular 20). If NGXS doesn't yet support 21, the fallback
  decision is to **pin superadmin to Angular 20** for parity — record the outcome here.
- **Hosting:** Cloudflare Pages SPA, same as frontend — `public/_redirects` catch-all,
  root dir `superadmin/`.
- **Environments:** `environment.ts` / `environment.development.ts` with `apiUrl`; the dev
  file's live-API override stays local-only (same `skip-worktree` convention as frontend —
  see root `CLAUDE.md`).

## 3. Auth

- Login page (`auth/pages/login/`) → backend user-auth endpoint (product users of this
  tenant; superadmin access is role-gated server-side).
- `AuthState` (persisted): token + current user summary. Guards check **presence only**;
  interceptor attaches `Authorization` and redirects to login on 401.
- Route guard pair: `authGuard` (token present) on the layout shell; role handling stays a
  backend concern — the shell renders what the API lets it read.

## 4. Layout + navigation

- `AuthenticatedLayout` component: fixed sidebar (desktop) / drawer (mobile) + topbar with
  dark-mode toggle + user menu (logout).
- Sidebar nav — one entry per module, in this order:
  **Dashboard** (placeholder page, v1: quick counts) · **Users** · **Reports** ·
  **Billing** · **Clients** (with CRM views nested: All / Leads / Blacklist) · **CMS** ·
  **Warehouse**.
- Routes are **lazy per feature** (`loadChildren` per module folder) so module agents ship
  independently.
- Port the frontend's scroll-reset behavior: the scrollable is the inner `<main>`, reset
  `scrollTop` on every `NavigationEnd`.

## 5. Theming port (from `frontend/`)

Copy, don't reinvent — keep byte-parity where possible:

- `tailwind.config.js` — palette scales (`granite`/`navy`/`sky`/`cyan`), semantic tokens,
  `darkMode: ['class', '.app-dark']`, `max-w-11/12` extension.
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

---

## Checkpoints

### CP-1 — Platform reset
- [ ] Remove SSR/express/hydration; plain browser build, `dist/superadmin/browser/`
- [ ] Zoneless change detection enabled
- [ ] NGXS installed (compat verified — record outcome in §2) + storage plugin
- [ ] Tailwind 3.4 wired into the build
- [ ] `npm run build` green

### CP-2 — Theming + conventions port
- [ ] `tailwind.config.js` ported (palette, semantic tokens, dark class, max-w-11/12)
- [ ] `styles.scss` globals ported
- [ ] `manttio-preset.ts` + PrimeNG providers (Aura, cssLayer, darkModeSelector)
- [ ] `src/theme/_index.scss` + initial override sheets
- [ ] `AppState` dark mode toggle working end-to-end (persisted, `<html>.app-dark`)
- [ ] `data/utils.ts` helpers ported

### CP-3 — Auth + layout (gate for module agents)
- [ ] `AuthState` + login page + interceptor + `authGuard`
- [ ] `AuthenticatedLayout` with sidebar/topbar, mobile drawer, scroll reset
- [ ] Lazy route stubs for all 7 module areas (placeholder pages)
- [ ] Global toast + confirm dialog mounted
- [ ] `public/_redirects` SPA catch-all
- [ ] Build green; login → dashboard → navigate all stubs

## Open decisions / asks
- NGXS-on-Angular-21 compat outcome: _unrecorded_.
- Backend: needs a superadmin-capable auth endpoint + role flag on users (ask recorded for
  backend planning).
