# client-portal / 03 — App shell

> **Status:** planned (doc) · **Depends on:** 02 (shapes) · **Feeds:** 04, 05, 06
> **Owner:** — · **Last updated:** 2026-08-30

Scaffolding `client-portal/` — the repo's fourth deployable app — and everything every page in
it depends on: stack, layout, routing, guards, theming, plumbing.

---

## 1. Stack (mirrors superadmin — 00 §3.2)

Match the versions actually in `superadmin/package.json`, not the (stale) Angular 20 line in
the root CLAUDE.md:

- Angular **21.2** standalone + **zoneless** (with the sanctioned zone.js fallback if real UI
  staleness ever appears)
- **NGXS 21** (store + storage + logger + devtools)
- **PrimeNG 21** with the Aura preset + the manttio preset overrides
- **Tailwind 3.4**, authored in the **semantic** `primary-*` / `surface-*` classes from day one
  (plan 16's rename is already done superadmin-side — the portal must not be born in the old
  `sky`/`granite` vocabulary and then need the sweep)
- `@lucide/angular` for icons, `@fontsource/figtree` for the UI stack (A12) and
  `@fontsource/atkinson-hyperlegible` for the numeric `font-data` stack
- **`@angular/ssr` scaffolding with every route `RenderMode.Client`** — the topology plan 25
  settled for both existing Angular apps. Nothing renders server-side; the server bundle exists
  so the Worker owns the request path and can serve `/__config`.

`superadmin/`'s binding conventions (`../superadmin/01-conventions.md` + the `superadmin-design`
skill) apply to this app **unchanged, typography included** (A12, §3).

## 2. Layout: reuse the superadmin `AuthenticatedLayout` (owner, 2026-08-28)

Same shell: collapsible sidebar rail + drawer on mobile, topbar with the user popover, dark-mode
toggle, boot splash until `/portal/auth/me` resolves, error panel on failure, scroll-to-top and
page-enter animation per navigation.

The two apps are separate Angular projects with no shared library, so **the layout is ported by
copy** at scaffold time, with three adaptations:

1. `NotificationCenter` is **dropped** — portal users get email, not in-app notifications
   (00 §3.15). The bell does not appear.
2. The sidebar's items come from the portal nav map (§4), each hidden unless the corresponding
   grant is present in `/portal/auth/me`.
3. `ForcePasswordDialog` is kept as-is — the invite flow depends on it.

**A11 resolved (owner, 2026-08-30): copy it into the new project and adapt.** Drift between
the two layouts is accepted and is not a defect to chase — they are two apps for two audiences
that happen to share a starting point. No shared package, no extraction, and a future change to
superadmin's shell carries **no obligation** to mirror it here.

## 3. Theming + typography

- **Colors, logo, tenant name: runtime `/brand`**, exactly like the field app — fetched during
  app init, written to CSS custom properties, no build-time brand, no literals anywhere.
- **Boot order is `/__config` → `/brand`, and it is not optional.** The brand fetch needs an API
  host, and under plan 25 the API host itself arrives at boot from `/__config`. A brand
  initializer that runs before the config initializer resolves will call a URL that does not
  exist yet — the same initializer-ordering trap 25 §3 documents. The two are folded into one
  ordered initializer, config first.
- **Typography: Figtree, same as superadmin** (A12, owner 2026-08-30). This is a deliberate
  departure from `01-conventions.md`'s tenant-facing rule: the portal is read as *product
  chrome* — an application the customer logs into — not as a branded marketing surface like
  `website/` or the field app's report output. **`Brand.font` is not consumed here**; colors,
  logo and tenant name still are. The `/fonts` endpoint is therefore not called at boot, which
  also removes one request from the critical path.
- Dark mode: same `AppState.darkMode` + storage-plugin persistence as superadmin.
- **No PWA / service worker.** The portal is an occasional-use read surface on good
  connectivity; the field app's offline machinery has no reason to be here.

## 4. Routing + nav

Public shell (no token): `/acceder` (login), `/recuperar` (forgot), `/restablecer` (reset,
takes the emailed token). Brand-themed, no sidebar.

Authenticated shell:

| Route | Nav label | Grant |
|---|---|---|
| `/inicio` | Inicio | — (always) |
| `/reportes` | Reportes | `view_reports` |
| `/contratos` | Contratos | `view_contracts` |
| `/cotizaciones` | Cotizaciones | `view_quotations` |
| `/ordenes` | Órdenes de servicio | `view_service_orders` |
| `/equipos` | Equipos | `create_service_requests` (A8) |
| `/solicitudes` | Solicitudes | `create_service_requests` |
| `/perfil` | (user popover) | — |

- `/inicio` for a user with **no** grants is an explanatory empty state, not a dead app
  (01 §3).
- Guards are **one per file** in `src/app/guards/`: `portal-auth.guard.ts` (token presence
  only — the backend stays the sole authority on validity) and a `grant.guard.ts` factory
  parameterized per route. No `access.ts` grab bag.
- **List filters and page live in the URL** as query params, and `queryParamMap` is the single
  load path — the same pattern as the superadmin lists.

## 5. Plumbing

- `src/state/` — `auth` (me, grants, status, login/logout/reset), `app` (dark mode, sidebar),
  one state per read feature.
- `src/http/` — one service per resource against `/portal/*`; an interceptor attaches the portal
  token and handles 401 by clearing state and routing to `/acceder`.
- `src/app/data/dtos/<resource>/` — interfaces only; **enums** live one-per-file in
  `src/app/model/enums/<entity>/`, **constants** one-per-file in
  `src/app/model/constants/<entity>/`.
- Repo rules that bind here without restating them per page: no `index.ts` barrels; no inline
  function calls in templates (computed signals / pure pipes); no enum or object members on
  component classes; type declarations out of component bodies; read-only data renders as text,
  never as disabled inputs; toast details are `errorMessage(err, fallback)` — backend errors
  verbatim.

## 6. Build + deploy — Workers Static Assets, per plan 25

The portal is scaffolded **directly onto the topology `../superadmin/25-runtime-config.md`
settled** (2026-08-28). It is a new app, so it skips the Pages→Workers migration the other two
apps had to perform and is simply born on the far side of it.

- **One Worker per tenant, one shared `client-portal/wrangler.jsonc`, zero tenant values in the
  repo** (25 §7). The config file carries a **placeholder `name`**; every real deploy overrides
  it: `npx wrangler deploy --name <tenant-worker>`.
- The config file mirrors `frontend/wrangler.jsonc`: `main` = the Angular server bundle,
  `assets.directory` = `./dist/client-portal/browser`, `compatibility_flags: ["nodejs_compat"]`,
  the `import.meta.url` `define` (Angular's server bundle calls `createRequire`), and
  `not_found_handling` **left at its default** — setting it to `single-page-application` serves
  the shell from the asset layer and bypasses the Worker, which would break `/__config`.
- **`keep_vars: true` is load-bearing.** Without it a deploy treats the file as the sole
  authority on bindings and silently deletes the dashboard-set `API_URL`.
- **`API_URL` is a plain-text var in each tenant Worker's dashboard** — per-tenant, and not a
  secret, since it ships to every browser anyway.
- `deploy:cf` refuses to run without an explicit tenant
  (`CF_WORKER_NAME=<tenant> npm run deploy:cf`), guard first in the script so an unset variable
  fails in a second rather than after a full production build.
- **There is no compiled `apiUrl` literal in this app.** It reads `GET /__config` at boot
  (25 §3), so the repo's "never commit `environment.development.ts`" rule has nothing to bite on
  here — the file that rule exists to protect is not created in the first place.
- Root `CLAUDE.md`'s deployable-apps table gains a `client-portal/` row (Hosting: **CF Workers**,
  not Pages), and the app gets its own `client-portal/CLAUDE.md` pointing at this suite (ship
  both with CP-1).
- **A4 resolved (owner, 2026-08-30): every tenant gets the portal.** It is part of the
  product's value proposition, not an upsell, so there is **no manager-side flag, no
  `module-isolation` key, and no 403 path** to design. The `module-isolation` suite's flagged
  list is unaffected and none of its three packages needs a portal entry. A tenant that has not
  invited anyone simply has a portal nobody logs into.

## 7. Checkpoints

- [ ] **CP-1** — `ng new client-portal`, stack + Tailwind + PrimeNG preset,
      `@angular/ssr` with all routes `RenderMode.Client`, the runtime-config layer +
      folded config→brand initializer, `client-portal/CLAUDE.md`, root CLAUDE.md row,
      build green.
- [ ] **CP-2** — public shell: login, forgot, reset, force-password dialog, auth state, token
      interceptor.
- [ ] **CP-3** — authenticated layout port + grant-driven nav + guards + `/inicio` empty state.
- [ ] **CP-4** — `wrangler.jsonc` + guarded `deploy:cf` + a tenant Worker with its `API_URL`,
      then a smoke pass against a real invited account.
