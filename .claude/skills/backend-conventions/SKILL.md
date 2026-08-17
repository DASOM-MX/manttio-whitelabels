---
name: backend-conventions
description: API + data conventions for the backend/ Hono-on-Workers service (module layout, repository pattern, zod validation, auth/roles, migrations, soft deletes, error shapes, testing). Use whenever creating or editing any backend/ controller, service, repository, model, validator, migration, or test.
---

# Backend conventions — `backend/`

Canonical source: **`backend/CLAUDE.md`** (this skill mirrors and compresses it — if they
disagree, `backend/CLAUDE.md` wins and needs updating in the same commit). Root
`CLAUDE.md` fork rules always win over both.

**Stack:** Hono 4 on Cloudflare Workers (Wrangler v4, `nodejs_compat`) · Neon Postgres via
the **WebSocket** driver (`@neondatabase/serverless` `Pool` → `drizzle/neon-serverless`) ·
Drizzle ORM · JWT (HS256, `jose`) · R2 · Resend · pdf-lib.

## Hard rules (non-negotiable)

1. **No entity is ever hard-deleted.** Soft delete via `deleted_at` only. No
   `db.delete(...)` on entity tables, no `ON DELETE CASCADE`, no wipe scripts. Every
   list/find helper filters `isNull(table.deletedAt)`. Applies to test fixtures too.
2. **No destructive migrations.** No `DROP TABLE`, no `DROP COLUMN`, no destructive
   rewrites. A column that is no longer used stays and stops being written.
3. **Every schema change ships as a generated migration.** `pnpm db:generate` → **read the
   generated SQL** → `pnpm db:migrate`. **Never hand-apply DDL, never `db:push` against a
   shared DB.** A new tenant is a new database provisioned by *running these migrations* —
   schema that exists only because someone typed it into psql is a provisioning bug.
4. **Every migration is idempotent**: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
   EXISTS`, `CREATE INDEX IF NOT EXISTS`, FKs inside `DO $$ … EXCEPTION WHEN
   duplicate_object` blocks. Note `CREATE TABLE IF NOT EXISTS` silently does nothing to an
   existing table — a migration that creates a table *and* adds columns needs both.
   **`drizzle-kit` does not emit `IF NOT EXISTS` for `ADD COLUMN`** — it generates a bare
   `ALTER TABLE … ADD COLUMN`, so the generated `.sql` must be **hand-edited** for
   idempotency before committing. Generating and committing the output unread is the
   failure mode this rule exists to catch.
5. **If `generate` proposes work you did not intend** (re-creating existing tables, any
   `DROP`), the `meta/` snapshot chain has drifted. **That is the bug to fix first** — do
   not apply it, do not hand-write around it.
6. **Controllers stay thin**: validate → read auth context → call a service → respond.
7. **Every query lives in a repository.** Controllers and services never call
   `db.select(...)` directly.
8. **All input goes through `@hono/zod-validator`** — never `await c.req.json()` in a
   handler.
9. **The backend is the sole authority on identity.** Read the user from
   `c.get('user')`, never trust client-supplied identity (the one sanctioned exception is
   the trusted-field model for offline report sync, which still FK-validates).
10. **Don't run `pnpm test` casually** — `DATABASE_URL` in `.dev.vars` points at the **live
    Neon DB**. `pnpm typecheck` is the cheap gate.

## Module layout (module-first, NestJS-like)

`src/` holds only `env.ts` (bindings + `AuthUser`), `index.ts` (composition root), and
`modules/`. **All logic for a domain lives under its module.** There is no top-level
`routes/`, `db/`, `lib/`, `middleware/` or `validators/`.

| Folder | Holds |
|---|---|
| `controllers/*.controller.ts` | thin Hono router |
| `services/*.service.ts` | business logic / orchestration |
| `repository/*.repository.ts` | every Drizzle query + mutation |
| `models/*.model.ts` | Drizzle table definitions only (acyclic FK imports) |
| `validators/*.validator.ts` | zod schemas **+ their exported `z.infer` types** |
| `dtos/*.dto.ts` | response shapes with no zod equivalent |
| `enums/*.enum.ts` | string-valued TS `enum`s |
| `constants/*.ts` | fixed values / reference data — **never markup** |
| `types/*.types.ts` | internal types (row aliases, service/filter params) |
| `templates/*` | static markup assets a helper renders |
| `helpers/*.helpers.ts` | domain renderers/formatters that fill `templates/` |
| `http-errors/*.error.ts` | error classes a controller maps to a status |
| `utils/*.ts` | small generic pure helpers |
| `middleware/*.middleware.ts` | **`auth/` only** |

- **Domain modules:** `auth`, `users`, `customers`, `reports`, `report-templates`,
  `upload`, `cms`, `services`, `quotations`, `service-orders`, `visits`.
- **Cross-cutting modules** (must stay generic): `database/` (client + schema barrel +
  `db-errors`), `storage/` (R2), `email/` (Resend transport), `pdf/` (pdf-lib toolkit).
  Domain composition that *uses* one stays in the domain module — the report PDF **layout**
  is `reports/helpers/report-pdf.helpers.ts` calling the `pdf/` toolkit, same split as
  `email/` transport vs `reports/` email composition.
- **Schema barrel:** models define only tables; **all `relations()` live in
  `modules/database/schema.ts`** to avoid circular model imports. `drizzle.config.ts` and
  `database/client.ts` read the barrel.

## Enums

String-valued TS `enum`s in `enums/*.enum.ts`, so call sites read
`status === TemplateStatus.Draft`, never a magic string. Validate with
`z.nativeEnum(...)`; type DB columns with `.$type<TheEnum>()`.

Preferred over the older const-array + `(typeof X)[number]` union pattern. `Role`,
`WorkType`, `ReportType` and `ReportStatus` still use the old shape — **migrate them to
enums as you touch those modules**.

## Database

- **WebSocket driver only** — real transactions are required (the create-report flow
  atomically bumps a counter, inserts a header and inserts N detail rows). Never switch to
  neon-http.
- Repository functions take a `Db` plus typed args and return typed rows. Pull types with
  `typeof table.$inferSelect` / `$inferInsert`, aliased in the module's `types/*.types.ts`.
- **Postgres error mapping:** use `isForeignKeyViolation` / `isUniqueViolation` from
  `modules/database/db-errors.ts` rather than catching `Error` blindly, so the service can
  translate to the right status (400 vs 409 vs 422).
- Don't record a "migrations current through NNNN" high-water mark anywhere —
  `drizzle.__drizzle_migrations` is the only answer, and a tracked number goes stale.

## Routing

- Mounted off `src/index.ts`; **order matters** — `logger()` + `cors()`, then the public
  auth router, then the JWT middleware on each protected prefix, then protected routers.
- Kebab/lowercase paths, plural collection nouns, `:id` sub-routes. Public-by-design
  endpoints get an explicit prefix the JWT middleware whitelists
  (`/reports/download/{token}`, `/public/cms/*`).
- Routers are `Hono<AppBindings>` so `c.env` / `c.get('user')` are typed.
- Validate `:id` with `z.string().uuid()` in the handler when the format matters.

## Auth + roles

- `requireRole(roles: Role[])` takes an **explicit allow-list** — there is no implicit
  hierarchy in the middleware. Compose inline:
  `router.post('/', requireRole(['owner', 'admin']), zValidator('json', schema), handler)`.
- **`owner` outranks `admin` in the product, so it is listed wherever `admin` is** — but a
  role only passes a gate it is named on. Inline branches use `isAdminTier(user)` /
  `ADMIN_TIER` from `auth/utils/role-tier.ts`, **never `role === 'admin'`** (which silently
  drops owners into the technician branch).
- **Reads are open to any authenticated user; writes are typically owner/admin.**
  Technicians get a narrower surface (their own reports, no customer CRUD).
- Owner rows are immutable in-tenant — mutations targeting one throw
  `CannotModifyOwnerError` → `403 cannot_modify_owner`.

## Error shape

`{ error: 'snake_case_code', message?: 'human readable' }` — a stable code plus a human
message (the frontend's `errorMessage` helper reads `err.error.message` first).

Status reflects the class: `400` validation · `401` auth · `403` role · `404` missing ·
`409` conflict · `500` unexpected.

Services **throw** typed domain errors (`EmailInUseError`, `NotAnImageError`, …); the
**controller catches and translates**. Services may also return a domain result the
controller relays — `reports.service.ts` returns `{ status, body }` for `c.json(body,
status)`.

## Testing

- Vitest via `@cloudflare/vitest-pool-workers`, running **inside** the Workers runtime with
  the bindings from `wrangler.toml` + `.dev.vars`. Resend is mocked.
- **The suite hits the live Neon DB.** Never run with a destructive `DATABASE_URL`
  override; never run on top of in-flight production data without checking fixture cleanup.
- Helpers in `test/helpers/`: `request()`, `json()`, `authHeader()`, `jsonHeaders()`,
  `fixtures.ts`. One `*.test.ts` per resource plus `smoke.test.ts`.
- Fixtures are identified by marker, never hard-deleted: `test+%` emails for users,
  `dasom.mx+test-%@gmail.com` for customers, `test+<scope>-<tag>` names for tables with no
  email column, transitive markers for tables with neither (visits reach theirs through
  `test-%` customers). Tables that can't isolate (per-tenant singletons like `cms_*`)
  snapshot in `beforeAll` and restore in `afterAll`.

## Scripts

| Script | Does |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` — the cheap gate, run it always |
| `pnpm test` | Vitest, **live DB** — not casual |
| `pnpm db:generate` | generate a migration from schema changes |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm dev` | `wrangler dev` on :8787 |
| `pnpm deploy` / `deploy:prod` | `wrangler deploy [--env production]` |

## Configuration

`wrangler.toml` declares non-secret vars (`[vars]` dev defaults, `[env.production.vars]`
overrides — Wrangler v4 inherits, so prod redeclares only what differs) and bindings.
Secrets (`DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`) are set out-of-band via
`wrangler secret put`; `.dev.vars` mirrors them locally and **is never committed**.

Brand-ish values belong in `wrangler.toml`, not hardcoded — but per the fork's whitelabel
rule, tenant identity increasingly comes from the brand table at runtime, not from vars.

## Checklist (before closing any backend task)

- [ ] Query in a repository, business rule in a service, controller thin
- [ ] Input validated by `zValidator`, inferred type exported from the validator
- [ ] Role gate names `owner` wherever it names `admin`; no `role === 'admin'`
- [ ] Soft delete only; no cascade; list helpers filter `isNull(deletedAt)`
- [ ] Schema change → generated migration, SQL read, idempotent, non-destructive
- [ ] Errors are `{ error, message }` with the right status; typed error thrown in the
      service, mapped in the controller
- [ ] New enum is a real TS `enum` + `z.nativeEnum` + `.$type<>()`
- [ ] `pnpm typecheck` green
