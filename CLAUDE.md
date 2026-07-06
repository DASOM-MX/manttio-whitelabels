# Repo overview

## Project state (as of 2026-07-04)

This is the **manttio** monorepo — a small set of independently-deployed apps for the HVAC field-service product, plus the marketing site for the brand it ships under.

### Fork context

This repo (`manttio-whitelabeled`, remote `DASOM-MX/manttio-whitelabels`) is a **fork of the original `manttio` project** (sibling checkout at `../manttio`, remote on the upstream org). The fork exists to build the **whitelabel / multi-tenant** variant of the product, where each tenant serves its own branded site from shared infrastructure.

What differs from upstream so far:

- **New `superadmin/` app** — an in-product admin (Angular 20) where a logged-in **client** edits their own CMS content (`cms_home`, `cms_clients`), tenant-scoped and product-user-authed (never the shared token). See `.claude/plans/superadmin/00-master-plan.md`.
- **Whitelabel plans** — design docs for the whitelabeled backend/frontend/manager surfaces live as `*-plan.md` files at the root of each package; the superadmin module planning suite (plans 00–14) lives in `.claude/plans/superadmin/`.
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

### Cross-cutting conventions

These apply across packages; per-package CLAUDE.md files own the rest.

- **Branch naming:** `<feature|fix|hotfix>/<project>-<brief-description>`, e.g. `feature/frontend-offline-sync-multiselect`, `fix(backend)/cors-preflight`. The `<project>` slug is `frontend`, `backend`, `fullstack` (when both move together), `website`, or `docs`.
- **Commit prefixes:** Conventional-ish: `feat(<project>)`, `fix(<project>)`, `docs(<project>)`, `style(<project>)`, `chore(<project>)`. Use `fullstack` for changes that span backend + frontend in the same PR.
- **PR base is always `main`.** Stacked PRs are rare here — always re-check the base before merging (`gh pr view <N> --json baseRefName`), GitHub does not auto-retarget stacked PRs after the parent merges.
- **Git identity:** never override with `-c user.name=…` / `-c user.email=…`. Use whatever the local git config already has.
- **`.claude/` IS committed** (shared agent context for all devs: `skills/`, `plans/`) — **exception: `.claude/settings.local.json`** (per-user permissions, gitignored).
- **Don't commit:** `frontend/src/environments/environment.development.ts` (local API URL override); `backend/.dev.vars` (local secrets); anything matching `.env*` outside the checked-in `*.example` files.
- **Backend is the sole authority on JWT validity.** Frontend never decodes tokens; guards check presence only, the HTTP interceptor handles 401s.
- **Soft deletes** are the default for user-facing resources (`users`, `customers`, `reports`, `reportDetails`). Hard deletes are reserved for fixture cleanup. The `users` table additionally carries `delete_comment` + `deleted_by` for an audit trail.

### Where things live in `backend/`

Backend is **module-first (NestJS-like)**: `src/` holds only `env.ts`, `index.ts`, and `modules/`. Each domain owns its full stack; cross-cutting concerns are their own modules. See `backend/CLAUDE.md` → "Module layout" for the folder taxonomy.

- `src/index.ts` — Hono app entry + middleware order (composition root; mounts each module's controller).
- `src/env.ts` — global `Env` bindings + `AuthUser`.
- `src/modules/<domain>/` — `controllers/` (thin routers) + `services/` (business logic) + `repository/` (Drizzle queries) + `models/` (tables) + `validators/` (zod + inferred inputs) + `dtos/`/`enums/`/`constants/`/`types/`/`templates/` (markup) / `helpers/` (renderers) / `http-errors/`/`utils/`/`middleware/` as needed. Domains: `auth`, `users`, `customers`, `reports`, `upload`.
- `src/modules/database/` — Drizzle `client.ts`, `schema.ts` (barrel: re-exports every model + holds all `relations()`), `db-errors.ts`.
- `src/modules/storage/` — R2 `storage.service.ts` + `form-data` utils. `src/modules/email/` — generic `sendEmail` transport (Resend). `src/modules/pdf/` — generic pdf-lib toolkit (report layout stays in `reports/helpers/`).
- `drizzle/migrations/` — generated SQL; live DB current through `0008`. `drizzle.config.ts` reads the `modules/database/schema.ts` barrel.
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
- Angular/NGXS/PrimeNG/Tailwind/dark-mode/dialog patterns — `frontend/CLAUDE.md`.
- Marketing-site styling/brand voice — `website/CLAUDE.md`.
