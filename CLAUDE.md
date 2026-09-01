# Repo overview

## Project state (as of 2026-07-04)

This is the **manttio** monorepo — a small set of independently-deployed apps for the HVAC field-service product, plus the marketing site for the brand it ships under.

### Fork context

This repo (`manttio-whitelabeled`, remote `DASOM-MX/manttio-whitelabels`) is a **fork of the original `manttio` project** (sibling checkout at `../manttio`, remote on the upstream org). The fork exists to build the **whitelabel / multi-tenant** variant of the product, where each tenant serves its own branded site from shared infrastructure.

What differs from upstream so far:

- **New `superadmin/` app** — an in-product admin (Angular 20) where a logged-in **client** edits their own CMS content (`cms_home`, `cms_clients`), tenant-scoped and product-user-authed (never the shared token). See `.claude/plans/superadmin/00-master-plan.md`.
- **Whitelabel plans** — design docs for the whitelabeled backend/frontend/manager surfaces live as `*-plan.md` files at the root of each package; the superadmin module planning suite (plans 00–15) lives in `.claude/plans/superadmin/`.
- **Local-only dev overrides** — `frontend/src/environments/environment.development.ts` here points at the deployed `manttio-api.dasom-mx.workers.dev` (not committed / `skip-worktree`'d so it stays local for testing). Upstream keeps `http://127.0.0.1:8787`.
- Upstream-only CI workflows under `.github/workflows/` are dropped in this fork.
- **Worktrees** for this repo live at `../manttio-whitelabeled-worktrees` (sibling to the checkout), kept out of the working tree — create feature/isolation worktrees there, not inside the repo.

Keep changes that belong upstream in the `../manttio` checkout; use this repo for whitelabel-specific work.

### Deployable apps

| Dir | Stack | Hosting | Status |
|---|---|---|---|
| `backend/` | Hono 4 on Cloudflare Workers (Wrangler v4) + Neon Postgres via the WS driver + Drizzle ORM | CF Workers (`manttio-api`) | **Active** — see `backend/CLAUDE.md` for API conventions |
| `frontend/` | Angular 20 (standalone, zoneless) + NGXS 20 + PrimeNG Aura + Tailwind 3.4, PWA via `@angular/service-worker` | Cloudflare Pages (output `dist/manttio/browser/`) | **Active** — see `frontend/CLAUDE.md` for web-app conventions |
| `website/` | Astro marketing site for the **Peña Nevada Chillers** brand | Cloudflare Pages | **Active** — see `website/CLAUDE.md` |
| `backend-firebase/` | Legacy Firebase Functions backend | — | **Archived.** Do not touch unless asked; it predates the Hono/Neon rewrite. |

### Brand & naming

- **`manttio`** is the repo dir + internal product code-name for the field-service app (backend + frontend).
- **Peña Nevada Chillers** is the customer-facing brand for the marketing site under `website/`. Never use "manttio" in user-facing copy on the marketing site.
- **Whitelabel de-branding (fork rule):** this fork must **not hardcode the Peña Nevada Chillers brand** in shipped app code or config — brand name, PWA title/manifest, logo, colors, domains (`penanevadachillers.com`), email `from`/subject, and CDN base all come from **tenant brand config at runtime** (the backend `/brand` endpoint), never a literal. Treat every hardcoded reference as debt to migrate to tenant config. The 2026-07-10 inventory was cleared 2026-07-12 by the `field-app-whitelabeling` suite (PR-A/B/C: brand table + `/brand` + `/fonts`, de-hardcoded email/PDF, field-app runtime theming, dynamic PWA manifest with backend-generated icons). Still hardcoded by design: the `penanevadachillers.com` **infra domains** in `backend/wrangler.toml` (`CDN_BASE_URL`, `LOGOS_CDN_BASE_URL`, `API_BASE_URL`, `RESEND_FROM`) — per-deploy values, swapped per tenant at deploy time.
  - **Two caveats when removing:** (1) the generic HVAC noun **"chillers"** (e.g. `website/src/lib/defaults.ts` marketing copy — "renta y venta de chillers…") is legitimate domain vocabulary, **not** the brand — leave it. (2) `backend/wrangler.toml` `BRAND_*`/domains are the **live current-tenant deployment values** — migrate them into tenant config, don't blind-delete (would break the running deployment).

### Cross-cutting conventions

These apply across packages; per-package CLAUDE.md files own the rest.

- **Branch naming:** `<feature|fix|hotfix>/<project>-<brief-description>`, e.g. `feature/frontend-offline-sync-multiselect`, `fix(backend)/cors-preflight`. The `<project>` slug is `frontend`, `backend`, `fullstack` (when both move together), `website`, or `docs`.
- **Commit prefixes:** Conventional-ish: `feat(<project>)`, `fix(<project>)`, `docs(<project>)`, `style(<project>)`, `chore(<project>)`. Use `fullstack` for changes that span backend + frontend in the same PR.
- **PR base is always `main`.** Stacked PRs are rare here — always re-check the base before merging (`gh pr view <N> --json baseRefName`), GitHub does not auto-retarget stacked PRs after the parent merges.
- **Git identity:** never override with `-c user.name=…` / `-c user.email=…`. Use whatever the local git config already has.
- **`.claude/` IS committed** (shared agent context for all devs: `skills/`, `plans/`, `agents/`) — **exception: `.claude/settings.local.json`** (per-user permissions, gitignored).
- **Scoped subagents** live in `.claude/agents/<name>.md`. Keep one narrowly scoped to a plan or app, name its out-of-bounds dirs explicitly, and have it **commit but never push or open PRs** — pushing and PR authoring stay with the main session. **Merging is always the user's, with no exceptions ever granted to anyone.** Existing:
  - `report-templates-field-app` (whitelabel plan 03 CP-4…CP-6, `frontend/` only) and `report-templates-backend` (03 CP-1…CP-3, `backend/` only — generates migrations but never applies them; the live Neon DB is a human's call).
  - `client-portal-backend` (client-portal 01, 02, 04 CP-1, 05 CP-1, 06 CP-1/2/4/5/6 — `backend/` only) and `client-portal-app` (03, 04 CP-2…CP-7, 05 CP-2/3, 06 CP-3 — `client-portal/` only; copies from `superadmin/`, never edits or imports across app boundaries).
  - `client-portal-review` — reviews a checkpoint diff against `.claude/plans/client-portal/`. Holds no `Edit`/`Write` tools at all.

  **Exceptions to the never-push rule** (each one granted deliberately by the owner, and each one narrow — assume an agent has no exception unless it is listed here):

  | Agent | Exception | Bounded by |
  |---|---|---|
  | `client-portal-review` | May `git push` its branch and open a PR (`gh pr create`, base always `main`) | Only on its own `VERDICT: ship`; never on `fix first` or `incomplete`. Never merges, approves, enables auto-merge, or force-pushes. Never edits code — it has no editing tools. |

  An agent that both writes code and opens PRs would be reviewing itself, so the exception is deliberately held by the one agent that cannot write code. If a future agent needs it, add a row rather than loosening the rule.
- **Don't commit:** `frontend/src/environments/environment.development.ts` (local API URL override); `backend/.dev.vars` (local secrets); anything matching `.env*` outside the checked-in `*.example` files.
- **Backend is the sole authority on JWT validity.** Frontend never decodes tokens; guards check presence only, the HTTP interceptor handles 401s.
- **No entity is ever hard-deleted (fork rule, 2026-07-19).** Soft delete (`deleted_at`) is the *only* removal mechanism, for every domain entity — no hard-DELETE endpoints, no `ON DELETE CASCADE`, no wipe scripts, no destructive migrations. Read helpers always filter `isNull(deletedAt)`. Deleting a customer with reports succeeds and leaves the reports' FK intact (no 409 in_use). `customer_interactions` is stricter still: append-only, no updates either — the timeline IS the audit trail. The `users` table additionally carries `delete_comment` + `deleted_by` for the delete audit.

### Where things live in `backend/`

Backend is **module-first (NestJS-like)**: `src/` holds only `env.ts`, `index.ts`, and `modules/`. Each domain owns its full stack; cross-cutting concerns are their own modules. See `backend/CLAUDE.md` → "Module layout" for the folder taxonomy.

- `src/index.ts` — Hono app entry + middleware order (composition root; mounts each module's controller).
- `src/env.ts` — global `Env` bindings + `AuthUser`.
- `src/modules/<domain>/` — `controllers/` (thin routers) + `services/` (business logic) + `repository/` (Drizzle queries) + `models/` (tables) + `validators/` (zod + inferred inputs) + `dtos/`/`enums/`/`constants/`/`types/`/`templates/` (markup) / `helpers/` (renderers) / `http-errors/`/`utils/`/`middleware/` as needed. Domains: `auth`, `users`, `customers`, `reports`, `upload`, `cms` (headless CMS store: draft/publish docs + public published reads at `/public/cms/*`).
- `src/modules/database/` — Drizzle `client.ts`, `schema.ts` (barrel: re-exports every model + holds all `relations()`), `db-errors.ts`.
- `src/modules/storage/` — R2 `storage.service.ts` + `form-data` utils. `src/modules/email/` — generic `sendEmail` transport (Resend). `src/modules/pdf/` — generic pdf-lib toolkit (report layout stays in `reports/helpers/`).
- `drizzle/migrations/` — generated SQL, applied only via `pnpm db:migrate` (never by hand — a new tenant DB is provisioned by running these). `drizzle.config.ts` reads the `modules/database/schema.ts` barrel.
- `test/` — Vitest hits the **live Neon DB**, don't run casually.

### Where things live in `frontend/`

- `src/app/<feature>/pages/<page>/` + `src/app/<feature>/components/<thing>/` — feature folders (`auth`, `customers`, `reports`, `users`).
- `src/app/shared/components/` — cross-feature widgets (incl. the globally-mounted `sync-pending-reports-dialog`).
- `src/app/validators/` — shared `ValidatorFn`s.
- `src/app/data/` — DTOs (`dtos/<resource>/`), shared types, helper utils (`utils.ts`).
- `src/state/<resource>/` — NGXS state + actions.
- `src/http/<resource>.service.ts` — Angular HTTP services (one per resource).
- `src/offline/` — IndexedDB (Dexie) queue, `OfflineSyncService` reconnect watcher, `SyncDialogBridge` (root Subject the dialog subscribes to).
- `src/app/theme/manttio-preset.ts` + `src/theme/*.scss` — PrimeNG Aura preset + per-component override sheets.

### Pointers (per-package conventions)

- API conventions, auth, validation, R2, email/PDF, testing — `backend/CLAUDE.md`.
- Angular/NGXS/PrimeNG/Tailwind/dark-mode/dialog patterns — `frontend/CLAUDE.md`, expanded by
  the **`field-app-design`** skill (structure, HTTP/NGXS/Dexie idioms, lazy `<p-select>`,
  pre-close checklist).
- Superadmin quick rules + pointers to its canonical conventions
  (`.claude/plans/superadmin/01-conventions.md` + the `superadmin-design` skill) —
  `superadmin/CLAUDE.md`.
- Marketing-site styling/brand voice — `website/CLAUDE.md`.
