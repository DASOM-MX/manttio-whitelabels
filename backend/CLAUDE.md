# API rules

## Project state (as of 2026-07-02)
- **Cloudflare Workers** (Wrangler v4) running **Hono 4** in TypeScript. Entry: `src/index.ts`, deployed as `manttio-api`. `compatibility_flags = ["nodejs_compat"]` so we can use `bcryptjs` and a few Node-flavored libs.
- **Postgres** on **Neon** via `@neondatabase/serverless`'s **WebSocket driver** (not neon-http) — chosen for real transactions (the create-report flow updates a counter + a header row + N detail rows atomically). Live DB is current through migration `0008` (`deleted_by` on users).
- **Drizzle ORM** for the schema (`src/modules/database/schema.ts` barrel + per-module `models/*.model.ts`) and queries (`src/modules/<resource>/repository/*`). Migrations live in `drizzle/migrations/` and are run via `drizzle-kit` (see `db:*` scripts).
- **Auth** via JWT (HS256) using `jose`. Token payload is `{ sub: userId, role }`. TTL: `7d` in dev, `1d` in prod.
- **R2** bucket (binding: `MANTTIO_REPORTS`) for report images + generated PDFs. Public reads served via `CDN_BASE_URL` (Cloudflare CDN sitting in front of the bucket).
- **Email** via **Resend** (thin wrapper, no SDK). Outbound only — the app sends report PDFs to customer-supplied recipients. Brand vars (`BRAND_*`, `RESEND_FROM`) live in `wrangler.toml`. `RESEND_API_KEY` is a secret.
- **Tests:** Vitest with `@cloudflare/vitest-pool-workers` running inside miniflare. **Hits the live Neon DB** (with isolated `test+...` and `dasom.mx+test-...` fixture emails); Resend is mocked. See "Testing" below — don't run `pnpm test` casually.
- **Audited soft-delete on users:** `DELETE /users/:id` requires a Zod-validated `{ deleteComment }` body and stamps `users.delete_comment` + `users.deleted_by` (self-FK to `users.id`, `ON DELETE RESTRICT`) alongside `deleted_at`. The route guards self-delete (`me.id === id → 400 cannot_delete_self`). Customers/reports keep the no-comment soft delete for now — this audit shape is users-only.
- **Customer timezone:** `customers.timezone` (IANA, e.g. `America/Monterrey`) is the source of truth for any report date rendered to a customer; user rows no longer carry a timezone. Validators default to `DEFAULT_MEXICAN_TIMEZONE` from `src/modules/customers/constants/timezones.ts` when omitted.

## Module layout (NestJS-like, module-first)
`src/` holds only `env.ts` (global bindings + `AuthUser`), `index.ts` (composition root), and `modules/`. **All logic for a domain lives under its own module.** No top-level `routes/`, `db/`, `lib/`, `middleware/`, or `validators/` — those were removed in the modular refactor.

- **Domain modules:** `auth/`, `users/`, `customers/`, `reports/`, `upload/`.
- **Cross-cutting modules (not junk drawers):** `database/` (Drizzle client + schema barrel + `db-errors`), `storage/` (R2 service + form-data utils), `email/` (generic Resend transport).
- **Per-module folders (create only what a module needs):**
  - `controllers/*.controller.ts` — the thin Hono router (validate → service → respond).
  - `services/*.service.ts` — business logic / orchestration.
  - `repository/*.repository.ts` — every Drizzle query/mutation.
  - `models/*.model.ts` — Drizzle table definitions (entities).
  - `validators/*.validator.ts` — zod request schemas **+ their `z.infer` input types**.
  - `dtos/*.dto.ts` — output/response shapes with no zod equivalent (only `users/` has one: `PublicUser`).
  - `enums/*.enum.ts` — literal unions + value arrays (`Role`, `WorkType`, `ReportType`, `ReportStatus`).
  - `constants/*.ts` — fixed values / reference data (e.g. `customers/constants/timezones.ts`).
  - `types/*.types.ts` — internal TS types (DB row aliases, service/filter params).
  - `templates/*.template.ts` — pdf / email renderers.
  - `utils/*.ts` — pure helpers (id gen, tokens, lifecycle predicates).
  - `middleware/*.middleware.ts` — Hono middleware; **`auth/` only** (jwt + roles).
- **Schema barrel:** each `models/*.model.ts` defines only its tables (acyclic FK imports); **all `relations()` live in `modules/database/schema.ts`** to avoid circular model imports. `drizzle.config.ts` and `database/client.ts` read the barrel.

## Routing structure
- All routes mounted off `src/index.ts`. Order matters: `app.use('*', logger())` + `cors()` first, then the public auth router, then the JWT middleware on every protected prefix, then the protected routers.
- One controller per resource under `src/modules/<resource>/controllers/*.controller.ts` (`auth`, `users`, `customers`, `reports`, `upload`). **Controllers stay thin** — validate → look up auth context → call a service → respond. Business rules/orchestration live in `services/`; queries in `repository/`.
- Path conventions: kebab/lowercase, plural collection nouns (`/customers`, `/reports`), `:id` for the single-resource sub-route. Public-by-design endpoints get an explicit prefix that the JWT middleware whitelists — currently only `/reports/download/{token}` (per-recipient access token model below).
- Hono router instances are `Hono<AppBindings>` (see `src/env.ts`) so `c.env`, `c.get('user')`, etc. are typed.

## Auth + roles
- JWT middleware: `src/modules/auth/middleware/jwt.middleware.ts`. Reads `Authorization: Bearer <token>`, verifies with `jose.jwtVerify`, asserts `sub` is a string and `role` is in `['admin', 'technician']`, then stores `{ id, role }` on `c.set('user', ...)`. Any failure → `401 unauthorized`.
- Role guard: `requireRole('admin', 'technician'?)` from `src/modules/auth/middleware/roles.middleware.ts`. Compose it inline on the routes that need it: `customers.post('/', requireRole('admin'), zValidator('json', schema), handler)`. **Read endpoints are open to any authenticated user; write endpoints are typically admin-only.** Technicians get a narrower surface (their own reports, no customer CRUD).
- Login + token signing live in `src/modules/auth/services/`: `auth.service.ts` (`login()` → token | null), `jwt.service.ts` (`signAuthToken`, TTL environment-derived via `expiresInForEnv` — unknown env falls back to the shorter production TTL, fail-closed), `password.service.ts` (bcrypt).
- **The backend is the sole authority on token validity.** Never accept client-supplied user identity for trust — read it from `c.get('user')` after the JWT middleware runs.
- **Trusted-field model** for synced offline reports: when a technician uploads a report queued offline by a different user (themselves earlier), the uploader sends `created_by` (and may send `assigned_to`); the backend treats these as trusted but FK-validates against `users` before insert. See `modules/reports/services/reports.service.ts` (`submitReport`) for the `createdBy` / `assignedTo` handling.

## Database
- **Use the WebSocket driver** (`@neondatabase/serverless` `Pool` → `drizzle/neon-serverless`). Real transactions are needed for the atomic create-report flow (counter increment + header insert + details insert). Do not switch to neon-http.
- **Schema** is defined per-module in `models/*.model.ts` and re-exported from the barrel `src/modules/database/schema.ts` (which also holds every `relations()`). Tables: `users` (incl. `delete_comment`, `deleted_by` self-FK), `customers` (incl. `timezone`), `reports`, `reportDetails`, `reportCounters`, `reportEmails`. Use Drizzle's column helpers; pull types via `typeof table.$inferSelect` / `$inferInsert` (aliased in each module's `types/*.types.ts`).
- **Repository pattern**: every query/mutation goes in `src/modules/<resource>/repository/<resource>.repository.ts`. Controllers/services never call `db.select(...)` directly outside a repository. Repository functions take a `Db` (from `modules/database/client.ts`) plus typed args, return typed rows.
- **Soft deletes** via `deleted_at` (`isNull(table.deletedAt)` in every list filter). Hard deletes are reserved for fixture cleanup.
- **Postgres error mapping**: `src/modules/database/db-errors.ts` exports `isForeignKeyViolation` / `isUniqueViolation` that match SQLSTATE codes (and string fallbacks). Use these on inserts/updates rather than catching `Error` blindly — the service can then translate to the right HTTP status (400 vs 409 vs 422).
- **Migrations**: `pnpm db:generate` (after a schema change) → review the SQL under `drizzle/migrations/` → `pnpm db:migrate` (or `db:push` for dev iteration). `db:studio` opens Drizzle Studio against the configured DB.

## Validation
- All request bodies, query params, and form data go through `@hono/zod-validator` (`zValidator('json' | 'query' | 'form', schema)`) — never read `await c.req.json()` directly in a handler.
- Schemas live in `src/modules/<resource>/validators/<resource>.validator.ts`. Inferred input types come from the schema (`z.infer<typeof createCustomerSchema>`) and are exported alongside it, so controllers/services don't restate the shape. Output/response shapes with no zod equivalent go in `dtos/` instead (only `users/` has one).
- For path params (`:id`), validate with `z.string().uuid()` inside the handler when the id format matters.

## Uploads + R2
- The `upload/` module exposes `POST /upload/image` for one-image-at-a-time uploads from the frontend (used before a report is submitted — the URL is stashed client-side and committed alongside the report). `upload.service` validates `content-type` starts with `image/`; returns `{ url, key }` where `url` is the CDN URL (`CDN_BASE_URL + /` + key).
- Helpers in `src/modules/storage/services/storage.service.ts`: `r2Key(filename)` generates a deterministic, collision-safe key; `putObject` / `deleteObjects` / `cdnUrl` / `keyFromCdnUrl` wrap the bucket binding. Use them — don't call `c.env.MANTTIO_REPORTS` directly outside the storage service.
- Multipart form-data: parse via `c.req.formData()` and pull fields with the helpers in `src/modules/storage/utils/form-data.ts` (`fdGet`, `fdGetAll`, `isFile`) — they handle the `FormDataEntryValue` union cleanly.

## Email + PDF
- Outbound only. The PDF is generated server-side via `pdf-lib` (`modules/reports/templates/report-pdf.template.ts`), the HTML body via `modules/reports/templates/report-email.template.ts`, then dispatched through `modules/reports/services/report-email.service.ts` (`dispatchReportEmail`), which calls the generic transport `modules/email/services/email.service.ts` (`sendEmail`, provider-swappable Resend wrapper).
- `report-email.service` sends a `/reports/download/{token}` link backed by a row in `report_emails` with a high-entropy token (`modules/reports/utils/access-token.ts`), expiry, and revoke flag. The download route is the only path the JWT middleware whitelists.
- Brand strings (`BRAND_NAME`, `BRAND_SITE_URL`, `BRAND_LOGO_URL`, `RESEND_FROM`) come from `wrangler.toml` (`[vars]` + `[env.production.vars]`). Add new brand-ish values there, not hardcoded.
- The Resend wrapper is intentionally fetch-based (no `@resend/sdk`) to keep the Worker bundle small. Errors throw — the caller decides whether to roll back the `report_emails` row, surface the failure, or just log.

## Conventions
- **Controllers stay thin.** Lookup + insert/update logic belongs in a repository function; business rules (status transitions, lifecycle decisions, attribution) belong in a `services/` function. Controllers are mostly: validate → call service → respond. Services return domain results (`modules/reports/services/reports.service.ts` returns `{ status, body }` the controller relays via `c.json(body, status)`); typed domain errors (e.g. `EmailInUseError`, `CannotDeleteSelfError`, `NotAnImageError`) are thrown and mapped to HTTP in the controller.
- **`modules/reports/utils/report-lifecycle.ts`** is the single place for status-transition predicates (`isEditableStatus`, `isFinishedOrMailed`); the `ReportStatus` union + `REPORT_STATUSES` array live in `modules/reports/enums/reports.enum.ts` (`created → in-progress → finished → mailed`). Don't hardcode status strings in controllers/services.
- **Soft delete only** for user-facing resources (`customers`, `reports`, `users`, `reportDetails`). Repositories' list/find helpers all apply `isNull(deletedAt)` — pass an explicit flag if you ever need to read tombstoned rows.
- **Error response shape**: `{ error: 'snake_case_code', message?: 'human readable' }`. Use a stable code (the frontend's `errorMessage` helper reads `err.error.message` first). HTTP status reflects the class (`400` validation, `401` auth, `403` role, `404` missing, `409` conflict, `500` unexpected).
- **`AuthUser` is the only auth shape.** Don't pass random subsets of the user object around — pull from `c.get('user')` and pass the `{ id, role }` pair (or just the id) where needed.

## Testing
- `pnpm test` runs Vitest with `@cloudflare/vitest-pool-workers` — tests execute **inside the Workers runtime** via miniflare, with the bindings + secrets from `wrangler.toml` and `.dev.vars`.
- **`DATABASE_URL` in `.dev.vars` points at the live Neon database.** The suite creates and tears down fixture rows by email pattern. Running it locally is fine, but:
  - **Don't run with a destructive `DATABASE_URL` override.**
  - **Don't run on top of in-flight production data without checking the fixture cleanup.**
  - Resend is mocked in the test suite; the fixture email patterns (`test+...@penanevadachillers.com` for users, `dasom.mx+test-...@gmail.com` for customers) are still designed to be defense-in-depth deliverable in case a real send slips through.
- Test helpers live in `test/helpers/`: `request(path, init?)` calls `app.request` with the test env bindings, `json(res)` parses + asserts shape, `authHeader(token)` / `jsonHeaders(token?)` for typical headers, `fixtures.ts` for seeded users/customers/reports.
- One `*.test.ts` file per resource (`auth`, `users`, `customers`, `reports`, `upload`) + a `smoke.test.ts` for the bare `/` endpoint.
- Fixture cleanup is by email pattern — easy to wipe at release: `DELETE FROM users WHERE email LIKE 'test+%'` and `DELETE FROM customers WHERE email LIKE 'dasom.mx+test-%@gmail.com'`.

## Configuration + secrets
- `wrangler.toml` declares **vars** (non-secret) and bindings. The `[vars]` block is dev defaults; `[env.production.vars]` is the prod overrides. Wrangler v4 inherits top-level config, so production only needs to redeclare what differs.
- **Secrets** are set out-of-band via `wrangler secret put [--env production] <NAME>`:
  - `DATABASE_URL` — Neon Postgres connection string.
  - `JWT_SECRET` — HS256 signing key for `jose`.
  - `RESEND_API_KEY` — Resend API key for outbound mail.
- `.dev.vars` provides the same secrets locally for `wrangler dev` and the test suite. Don't commit it. `drizzle.config.ts` also reads `DATABASE_URL` from `.dev.vars` via `dotenv` so `db:*` scripts work without redeclaring.

## Scripts
- `pnpm dev` — `wrangler dev` (local Worker on `http://localhost:8787`, reads `.dev.vars`).
- `pnpm deploy` / `pnpm deploy:prod` — `wrangler deploy [--env production]`.
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm test` — Vitest (Workers pool). Live DB, see Testing above.
- `pnpm db:generate` / `db:migrate` / `db:push` / `db:studio` — Drizzle Kit.
- `pnpm seed:admin` — creates the bootstrap admin user (`scripts/seed-admin.ts`). Run once per fresh DB.
