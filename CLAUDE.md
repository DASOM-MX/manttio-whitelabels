# Repo overview

## Project state (as of 2026-06-10)

This is the **manttio** monorepo — a small set of independently-deployed apps for the HVAC field-service product, plus the marketing site for the brand it ships under.

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
- **Don't commit:** `.claude/` (per-clone IDE state), `frontend/src/environments/environment.development.ts` (local API URL override), `backend/.dev.vars` (local secrets), anything matching `.env*` outside the checked-in `*.example` files.
- **Backend is the sole authority on JWT validity.** Frontend never decodes tokens; guards check presence only, the HTTP interceptor handles 401s.
- **Soft deletes** are the default for user-facing resources (`users`, `customers`, `reports`, `reportDetails`). Hard deletes are reserved for fixture cleanup. The `users` table additionally carries `delete_comment` + `deleted_by` for an audit trail.

### Where things live in `backend/`

- `src/index.ts` — Hono app entry + middleware order.
- `src/routes/<resource>.ts` — thin route handlers.
- `src/db/schema.ts` — Drizzle schema; one place for tables.
- `src/db/repositories/<resource>.ts` — every query/mutation.
- `src/validators/<resource>.ts` — Zod request schemas.
- `src/lib/` — shared helpers (`jwt`, `r2`, `pdf`, `email-template`, `dispatch-email`, `resend`, `report-lifecycle`, `db-errors`, `timezones`, `access-token`, `form-data`).
- `src/middleware/` — `jwt`, `roles`.
- `drizzle/migrations/` — generated SQL; live DB current through `0008`.
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
