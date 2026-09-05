# client-portal / conventions & pointers

This is the **Portal de clientes** app — a customer-facing logged-in surface for viewing reports, contracts, quotations, service orders, and equipment, approving quotations, and filing service requests.

**Canonical source for the whole suite:** `.claude/plans/client-portal/` (00 overview, 03 app shell, etc.).
**Canonical source for superadmin-mirrored conventions:** `.claude/plans/superadmin/01-conventions.md` + the `superadmin-design` skill.

---

## Stack (mirrors superadmin, plan 03 §1)

- Angular **21.2** standalone + **zoneless**
- **NGXS 21** store + storage + devtools
- **PrimeNG 21** Aura preset + ManttioPreset overrides
- **Tailwind 3.4** semantic brand scales
- `@lucide/angular` icons, `@fontsource-variable/figtree` typography
- `@angular/ssr` with every route `RenderMode.Client`

## Build (plan 03 §6 — Workers Static Assets per plan 25)

- `npm run build` → `dist/client-portal/` (browser + server bundle)

**No compiled `apiUrl` literal in the production build.** Config reads from `GET /__config` at boot (plan 25 §3), falls back to `localStorage`, then to `environment.ts` — which ships `apiUrl` **empty**, so an unresolved host stays empty rather than pinning every tenant to one API. **Amended 2026-09-05 (owner):** `src/environments/` now exists for the sake of `ng serve`, where there is no Worker and both earlier rungs fail by design; `environment.development.ts` carries the local API and is swapped in by `fileReplacements`, the same mechanism superadmin uses. Point it at a live API only with `git update-index --skip-worktree`. The `deploy:cf` script and the tenant smoke pass land in CP-4.

## Key files & directories

- **`src/app/config/runtime-config.ts`** — fetches `/__config` at boot, falls back to `localStorage`, then to the compiled `environment` (empty in production, the local API under `ng serve`)
- **`src/cloudflare/worker.ts`** — Worker entry; answers `/__config` from the per-tenant `env.API_URL` binding (`?? null` when unset — never a fallback host) before delegating to the Angular engine
- **`wrangler.jsonc`** — Worker config: placeholder `name`, `keep_vars: true`, `not_found_handling` at its default
- **`src/app/theme/manttio-preset.ts`** — PrimeNG Aura tokens repointed to `--brand-primary-*` CSS vars
- **`src/styles.css`** → imports Tailwind + PrimeNG layer order + animations + theme integrations
- **`src/animations.scss`** — motion tokens + keyframes (Angular `animate.enter`/`animate.leave`)
- **`tailwind.config.js`** — semantic brand + surface scales, Figtree/Work-Sans fonts
- **`src/app/app.routes.ts`** — route definitions: public shell (`/login`, `/forgot-password`, `/reset-password`) + the authenticated shell (`/home` and beyond) behind `portalAuthGuard`
- **`src/app/app.config.ts`** — providers: router, HTTP, NGXS, PrimeNG, boot-time config initializer
- **`src/app/layouts/authenticated-layout/`** + **`src/app/layouts/components/sidebar/`** — ported from `superadmin/src/app/layouts/` (A11: copy + adapt, drift accepted, no shared package). Grant-driven flat nav (`app/model/constants/nav/portal-nav.const.ts`), the disabled Facturas row (own `disabledLabel` field on `PortalNavEntry`, never the badge slot), boot splash/error panel keyed on `AuthState.meStatus`
- **`src/app/guards/`** — one file per guard: `portal-auth.guard.ts` (token presence only), `grant.guard.ts` (per-route grant factory)

## Conventions (all from superadmin-design)

**Non-negotiable** (see skill for full rationale):

1. **No emojis, ever.** Lucide outlined icons only (`@lucide/angular`), `stroke-width: 2`, standard sizes.
2. **No AI-slop aesthetics.** Banned: glowing shadows, gradient text, neon gradients, glassmorphism, animated gradients.
3. **No inline function calls in templates.** Use `computed()` signals, getters, or pure pipes.
4. **No enum/object members on component classes.** Derive `computed()` booleans instead.
5. **Type declarations outside component classes.** Import from `app/data/dtos/<resource>/` or `app/data/types/<domain>/`.
6. **Constants one-per-file** in `app/model/constants/<entity>/<name>.const.ts`.
7. **Enums one-per-file** in `app/model/enums/<entity>/<name>.enum.ts`.
8. **Guards one-per-file** in `app/guards/<name>.guard.ts`. No `access.ts` grab bags.
9. **HTTP services** in `app/services/http/`. **Theme/color services** in `app/services/theme/`.
10. **Never create `index.ts` barrels.** Import concrete files directly.
11. **Never show values in disabled inputs.** Read-only renders as text/display rows, not `form.disable()`.
12. **Display backend errors verbatim.** Toast detail is `errorMessage(err, fallback)`, never hardcoded.
13. **List filters + page live in URL** as query params; `queryParamMap` is the single load path.
14. **Every list consumes `GenericQueryResponse<T>`** and paginates off `total`, never `items.length`.
15. **Titlecase headings/labels; `uppercase` is for warnings only.**
16. **No arbitrary Tailwind values** (`h-[235px]`). Standard scale utilities only.
17. **Tables render as `p-table`** (headers, bodies, `rowHover`, whole-row click, empty message).
18. **Motion is Angular `animate.enter`/`animate.leave` + CSS keyframes** in `animations.scss`. No anime.js.
19. **Stay zoneless.** Zone.js is sanctioned only if real UI staleness appears.
20. **Full entity names** in exported classes (`ServiceRequest`, never `Request`).
21. **Never screenshot** unless asked. Build, commit, describe in text.

## Checkpoint tracking

| Plan | CP | Deliverable | Status |
|---|---|---|---|
| 03 | CP-1 | App scaffold, stack, Tailwind + PrimeNG preset, SSR all-CSR, runtime-config + brand initializer, Worker + wrangler config, CLAUDE.md, root table row, build green | DONE |
| 03 | CP-2 | Public shell: login, forgot, reset, force-password dialog, auth state, token interceptor | DONE |
| **03** | **CP-3** | Authenticated layout, grant-driven nav with disabled Facturas row, guards, `/home` empty state | DONE |
| 03 | CP-4 | Guarded `deploy:cf`, tenant Worker `API_URL`, smoke pass | — |
| 04 | CP-2…CP-7 | Reportes, Contratos, Cotizaciones, Órdenes, Equipos, Inicio | — |
| 05 | CP-2, CP-3 | Quotation approval/decline UI | — |
| 06 | CP-3 | Service requests flow | — |

---

For all module-scoped decisions and detailed architectural docs, see the plan suite at `.claude/plans/client-portal/`.
