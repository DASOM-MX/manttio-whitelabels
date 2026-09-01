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

**No `environment.ts` file; no compiled `apiUrl` literal.** Config reads from `GET /__config` at boot (plan 25 §3), then falls back to `localStorage`. There is no third rung — an unresolved `apiUrl` stays empty rather than pinning the app to a host. The `deploy:cf` script and the tenant smoke pass land in CP-4.

## Key files & directories

- **`src/app/config/runtime-config.ts`** — fetches `/__config` at boot, falls back to `localStorage`, then gives up
- **`src/cloudflare/worker.ts`** — Worker entry; answers `/__config` from the per-tenant `env.API_URL` binding (`?? null` when unset — never a fallback host) before delegating to the Angular engine
- **`wrangler.jsonc`** — Worker config: placeholder `name`, `keep_vars: true`, `not_found_handling` at its default
- **`src/app/theme/manttio-preset.ts`** — PrimeNG Aura tokens repointed to `--brand-primary-*` CSS vars
- **`src/styles.css`** → imports Tailwind + PrimeNG layer order + animations + theme integrations
- **`src/animations.scss`** — motion tokens + keyframes (Angular `animate.enter`/`animate.leave`)
- **`tailwind.config.js`** — semantic brand + surface scales, Figtree/Work-Sans fonts
- **`src/app/app.routes.ts`** — route definitions (empty for CP-1, populated CP-2+)
- **`src/app/app.config.ts`** — providers: router, HTTP, NGXS, PrimeNG, boot-time config initializer

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
| **03** | **CP-1** | App scaffold, stack, Tailwind + PrimeNG preset, SSR all-CSR, runtime-config + brand initializer, CLAUDE.md, root table row, build green | IN PROGRESS |
| 03 | CP-2 | Public shell: login, forgot, reset, force-password dialog, auth state, token interceptor | — |
| 03 | CP-3 | Authenticated layout, nav with disabled Facturas row, guards, `/inicio` empty state | — |
| 03 | CP-4 | Guarded `deploy:cf`, tenant Worker `API_URL`, smoke pass | — |
| 04 | CP-2…CP-7 | Reportes, Contratos, Cotizaciones, Órdenes, Equipos, Inicio | — |
| 05 | CP-2, CP-3 | Quotation approval/decline UI | — |
| 06 | CP-3 | Service requests flow | — |

---

For all module-scoped decisions and detailed architectural docs, see the plan suite at `.claude/plans/client-portal/`.
