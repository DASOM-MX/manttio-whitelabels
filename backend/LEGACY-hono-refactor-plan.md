# Hono + Neon Refactor Plan

Migration of the backend from **NestJS + Firebase (Firestore) on Vercel** to **Hono on Cloudflare Workers + Neon Postgres**. Existing Firestore data is throwaway test data — no migration step required.

Branch: `backend-cf-workers-neon`
Worktree: `.claude/worktrees/backend-cf-workers-neon`

---

## Target stack

- **Runtime:** Cloudflare Workers (Wrangler)
- **HTTP:** Hono
- **DB:** Neon Postgres (serverless driver: `@neondatabase/serverless`)
- **ORM:** Drizzle ORM + `drizzle-kit` for migrations
- **Validation:** zod (+ `@hono/zod-validator`)
- **Auth:** `jose` for JWT sign/verify, `bcryptjs` for password hashing (pure JS, Workers-safe)
- **Object storage:** Cloudflare R2 (existing bucket `manttio-reports`, CDN `cdn.penanevadachillers.com`) — accessed via R2 binding, **not** AWS SDK
- **Image processing:** **decided — keep R2 only, no server-side resize.** Originals are uploaded as-is; clients/CDN handle any transformation on read. Drop `sharp` entirely.
- **Email:** **Resend** (sent from the Worker via `fetch`). Used for the admin "manually email out a report" feature.
- **Tests:** Vitest + Hono test client. Add zod-based contract tests for the 15 prod endpoints.

---

## Architectural decisions (locked)

- [x] **Image processing:** keep R2 only, no server-side resize. Drop `sharp`. Originals served via `cdn.penanevadachillers.com`; any resizing is client/CDN-side.
- [x] **Auth coverage:** JWT middleware applied to **everything except `/auth/*`**. `/user` and `/customers` are no longer wide open.
- [x] **Reports schema:** **header + details split** (`reports` 1:1 `report_details`). Header carries list-friendly fields; details hold `jsonb data`, pictures, signature, and content timestamps for lazy loading and forward scaling. New report types still ship as a new zod entry in a discriminator map — no DB migration. See §2.
- [x] **User role:** replace `boolean` with a `text` enum (`'admin' | 'technician'`). Roles middleware enforced via Hono.
- [x] **Report status lifecycle (state machine):**
  - States: `created` → `in-progress` → `finished` → `mailed`.
  - **`created`** — set by `POST /reports`. Header (and possibly empty details) exists, no content yet.
  - **`in-progress`** — entered implicitly on the first content write (PATCH details, picture upload, etc.). No explicit transition endpoint.
  - **`finished`** — entered when the report is signed via `PUT /reports/:id/signature`. Sets `finished_at`. The signing transition triggers an **automatic email** to `customers.email` if present (best-effort; failure does not block signing).
  - **`mailed`** — entered on the first successful email send (auto or admin-triggered). Sets `mailed_at`. Subsequent admin re-sends do not change status; they just append rows to `report_emails`.
  - **Editability:** statuses `created` and `in-progress` are editable (PATCH, add/remove pictures). `finished` and `mailed` are **locked** to all writes except admin re-send via `POST /reports/:id/email`.
  - **Permission rules:**
    - **admin:** list/read all, edit any **editable** report, sign any report, **reassign any report in any status**, send/re-send emails on demand, soft-delete.
    - **technician:** list/read reports **currently assigned to them**, sign **assigned** reports, edit **assigned editable** reports. No emails, no delete, no reassignment.
- [x] **Report ownership:** track two user FKs on `reports`:
  - **`created_by`** — set on `POST /reports`, immutable for the lifetime of the row. Records who originally opened the report (audit/attribution).
  - **`assigned_to`** — current owner. Defaults to `created_by` on insert. Mutable by admin via a dedicated endpoint, in any status.
  - Technician scope is computed against `assigned_to` only. A technician who created a report and later had it reassigned no longer sees it.
- [x] **R2 access:** R2 binding (`env.MANTTIO_REPORTS`), not AWS SDK. Drops `@aws-sdk/client-s3` from the bundle.
- [x] **Worker layout:** single Worker with Hono route groups.
- [x] **Package manager:** **pnpm**. Lockfile committed (`pnpm-lock.yaml`); `package.json` pins `"packageManager": "pnpm@<version>"`.

---

## Workstreams

### 0. Cleanup / decisions (no code yet)
- [x] Confirm decisions above with user.
- [ ] Capture target endpoint surface (15 prod endpoints, drop `r2-test/*`, fix `reports.findByUser` to use a real WHERE clause).
- [x] Package manager locked: **pnpm**.
- [ ] Decide Node version for tooling (Wrangler runs the Workers runtime; the host Node only matters for `pnpm`/`drizzle-kit`/`vitest`). Default: Node 22 LTS.

### 1. Scaffold ✅
- [x] Create new Worker project structure under `backend/` (or replace it):
  ```
  backend/
    src/
      index.ts          # Hono app entry
      env.ts            # typed Env bindings
      db/
        schema.ts       # Drizzle tables
        client.ts       # Neon + Drizzle client
      routes/
        auth.ts
        users.ts
        customers.ts
        reports.ts
        upload.ts
      middleware/
        jwt.ts
        roles.ts
      lib/
        r2.ts
        password.ts
        report-id.ts
      validators/
        *.ts            # zod schemas (request + response)
    drizzle/
      migrations/
    wrangler.toml
    drizzle.config.ts
    package.json
    tsconfig.json
  ```
- [x] `wrangler.toml`: R2 binding `MANTTIO_REPORTS`, vars for `CDN_BASE_URL` / `PUBLIC_VIEW_URL` / `RESEND_FROM`. Secrets (`DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`) set via `wrangler secret put` (or `.dev.vars` locally).
- [x] Removed `vercel.json`, NestJS deps, `nest-cli.json`, `libs/firebase`, `test-r2-connection.ts`, `test.cors.js`, `archivo-prueba.txt`, plus `.prettierrc`, old `README.md`, `tsconfig.build.json`.
- [x] JWT middleware scoped to `/users/*`, `/customers/*`, `/reports/*`, `/upload/*` so unknown paths return `404` and `/auth/*` + `/reports/view/*` stay public.
- [x] Smoke-tested locally (`pnpm dev`): `GET /` → 200, `GET /users` → 401, `GET /reports/view/x` → 501, `GET /nonexistent` → 404.

### 2. Database — Neon + Drizzle schema
- [ ] Provision Neon project, capture pooled + direct connection strings. _(user-owned)_
- [x] Drizzle schema:
  - `users`: id (uuid pk), name, email (unique, indexed), password_hash, role (text — `'admin' | 'technician'`), created_at, updated_at
  - `customers`: id (uuid pk), name, identification, phone, email (indexed), observation, created_at, updated_at
  - `reports` (**header — list-friendly, lazy-loaded against details**):
    - id (text pk, format `R-YYYYMMDD-NNNN`)
    - report_type (text — discriminator, e.g. `minisplit | chiller | uma | …`)
    - manttio_type (text)
    - date_arrival (timestamptz)
    - date_departure (timestamptz)
    - created_by (uuid fk users, not null — original creator, immutable; enforced in code, not DB)
    - assigned_to (uuid fk users, not null — current owner; defaults to `created_by` on insert; mutable by admin only)
    - client_id (uuid fk customers)
    - signed_by (text, nullable)
    - status (text, not null, default `'created'` — one of `'created' | 'in-progress' | 'finished' | 'mailed'`; CHECK constraint enforces enum)
    - signed_at (timestamptz, nullable — when signature was applied)
    - finished_at (timestamptz, nullable — transition into `finished`)
    - mailed_at (timestamptz, nullable — first successful email send)
    - deleted_at (timestamptz, nullable — for soft-delete)
    - created_at (timestamptz, default now())
    - updated_at (timestamptz, default now())
    - Indexes: `created_by`, `assigned_to`, `client_id`, `report_type`, `status`, `(assigned_to, status)` for technician dashboards.
  - `report_details` (**content — fetched only on detail view**):
    - report_id (text pk, fk reports(id) ON DELETE CASCADE — 1:1 with reports)
    - data (jsonb, not null — variant-specific fields validated by zod)
    - pictures (text[] of R2 CDN URLs, default `'{}'`)
    - signature (text, nullable — R2 CDN URL)
    - content_filled_at (timestamptz, nullable — first time content was written)
    - updated_at (timestamptz, default now())
    - GIN on `data` only if/when we start querying inside it.
  - `report_counters`: day (date pk), last_number (int) — atomic increment via `INSERT INTO report_counters (day, last_number) VALUES ($1, 1) ON CONFLICT (day) DO UPDATE SET last_number = report_counters.last_number + 1 RETURNING last_number`.
  - `report_emails` (**send log — one row per outbound email; PDF delivered via download link**):
    - id (uuid pk)
    - report_id (text fk reports(id) ON DELETE CASCADE)
    - sent_by (uuid fk users — the admin or signing technician who triggered the send)
    - sent_at (timestamptz, default now())
    - recipient_to (text, not null)
    - recipient_cc (text[], default `'{}'`)
    - access_token (text, not null — high-entropy, URL is the secret; resolves at `/reports/download/:token`)
    - expires_at (timestamptz, nullable — null = no expiry)
    - revoked_at (timestamptz, nullable — admin can invalidate a sent link)
    - resend_message_id (text, nullable — for cross-referencing in Resend's dashboard)
    - Indexes: `report_id`, `access_token` (unique).
  - ~~`report_email_opens`~~ — **dropped.** Open-tracking removed; we only record that we sent the email, not whether anyone opened it. Adequate for the billing audit trail.
- [x] Define `reportSchemas` zod registry in `src/validators/reports.ts`: `{ minisplit, chiller, uma }` plus a discriminated union (`reportPayloadSchema`) and `validateReportData(reportType, data)` helper. Adding a new report type = adding one entry — no DB migration.
- [ ] Repository contract: `createReport()` always inserts header + details inside a single transaction (atomic). _(implemented in §8)_
- [x] Drizzle migration regenerated → `drizzle/migrations/0000_futuristic_bastion.sql` (6 tables, 6 FKs, 11 indexes, 2 CHECK constraints — `report_email_opens` dropped; `report_emails` keeps token + expiry + revoke for the download link).
- [ ] Apply migration to Neon: `pnpm db:migrate` once `DATABASE_URL` is set in `.dev.vars` (and as a Worker secret for staging). _(blocked on user provisioning)_

### 3. Auth (template module — port first) ✅
- [x] **Closed registration confirmed.** `POST /auth/register` removed. New users land via `POST /users` (admin-only, §4) or via the `seed:admin` bootstrap script.
- [x] `POST /auth/login` — zod-validated, looks up user by email, verifies bcryptjs hash, signs JWT (jose, HS256), returns `{ token, user }`.
- [x] JWT middleware verifies tokens and attaches `c.set('user', { id, role })`. Public paths (`/`, `/auth/*`, `/reports/view/*`) bypass it. Unknown roles in payload → 401.
- [x] Roles middleware: `requireRole(...roles)` returns 403 if `c.get('user').role` is not in the list. Used per-route in §4–§9.
- [x] **JWT TTL is environment-aware:** `production` → `1d`, `dev` → `7d`. Default-on-unknown is `1d` (fail closed). `ENVIRONMENT` is a wrangler var; `[env.production]` block in `wrangler.toml` overrides it.
- [x] `pnpm seed:admin <email> <password> [name]` bootstraps the first admin (uses tsx + dotenv to read `.dev.vars`).
- [x] Smoke-tested locally: malformed JSON → 400, zod validation failure → 400, valid shape with empty `DATABASE_URL` → 500 with Neon error (expected). Full happy path runs once Neon is provisioned.

### 4. Users ✅
- [x] `GET /users`, `GET /users/:id`, `POST /users`, `PATCH /users/:id`, `DELETE /users/:id` — all admin-only via `users.use('*', requireRole('admin'))`. (Note: route prefix is plural `/users`, matching v1 plan; old NestJS path was singular `/user`.)
- [x] Role is a `text` enum (`'admin' | 'technician'`) at the TS layer, with a DB CHECK constraint matching.
- [x] `password` only accepted on input; responses use `toPublicUser` which drops `password_hash`.
- [x] Email uniqueness enforced via partial unique index `users_email_active_idx (email) WHERE deleted_at IS NULL`. Insert/update catches `23505` → 409 `email_in_use`.
- [x] **Soft delete**: `users.deleted_at` (timestamptz nullable). `DELETE /users/:id` flips `deleted_at = now()`; lookups (`findUserByEmail`, `findUserById`, `listUsers`) filter `deleted_at IS NULL`. Soft-deleted users can no longer log in. Reports keep their FK references intact.
- [x] **Self-delete guard**: admins cannot soft-delete their own account → 400 `cannot_delete_self`.
- [x] Schema migration regenerated → `drizzle/migrations/0000_gorgeous_centennial.sql` (replaces the prior 0000; not yet applied to Neon).

### 5. Customers ✅
- [x] `GET /customers`, `GET /customers/:id` — open to any authenticated user.
- [x] `POST /customers`, `PATCH /customers/:id`, `DELETE /customers/:id` — admin-only via per-route `requireRole('admin')`.
- [x] `DELETE /customers/:id` — hard delete with FK-safety: if any reports reference the customer, returns 409 `in_use`; otherwise deletes the row. (No soft delete on customers; can be added later if attribution needs to outlive deletion, the way users now do.)

### 6. R2 helper ✅
- [x] `lib/r2.ts` exposes `putObject`, `deleteObject`, `deleteObjects`, `r2Key`, `cdnUrl`, `keyFromCdnUrl`, `decodeBase64ToBytes`. All hit the R2 binding (`env.MANTTIO_REPORTS`); URLs are constructed as `${CDN_BASE_URL}/${key}`.
- [x] No image processing in the Worker — originals only. Filename scheme: `reports/{TIMESTAMP}-{sanitizedOriginalName}` (matches existing CDN paths).
- [x] Shared `lib/form-data.ts` (`fdGet`, `fdGetAll`, `isFile`) bridges the `@cloudflare/workers-types` mistyping of `FormData.get/getAll`. Used by both the reports module (§8) and the upload route (§7).

### 7. Upload ✅
- [x] `POST /upload/image` — multipart with single `file` field, auth required (mounted under `/upload/*` JWT scope; both admins and technicians may use). Validates `file.type.startsWith('image/')` (415 `not_an_image` otherwise); responds `400 no_file` if absent; on success uploads to R2 and returns `{ url, key }` with status 201.
- [x] Smoke-tested locally with a real PNG against the Miniflare R2 binding: 401/400/201/415 paths all behave correctly.

### 8. Reports (largest module) ✅
- [x] **Field rename**: `manttio_type` → `work_type` everywhere (schema, validators, repo, routes). Migration regenerated.
- [x] **DB driver switched** from `neon-http` to `neon-serverless` so `db.transaction(...)` works for atomic createReport (counter + header + details in one tx).
- [x] **Reports never publicly viewable.** `GET /reports/view/:token` removed; the JWT-skip prefix list emptied. §9 design (hosted-link email) now needs revisiting — see §9 below.
- [x] zod discriminated union for the 3 variants (minisplit/chiller/uma) validates `report_details.data` per `report_type`.
- [x] Status helpers in `src/lib/report-lifecycle.ts`: `isEditableStatus`, `isFinishedOrMailed`. Lifecycle transitions handled inline in routes / via repo helpers (`bumpToInProgress`, `markFinished`, `markMailed`).
- [x] Per-route `canAccess(user, report)` permission helper: admin always passes, technician must be `assigned_to = self`. Combined with `isEditableStatus` for write endpoints.
- [x] `POST /reports` — multipart with `pictures[]` + `signature` (file or `signature_base64`). Validates FK references (creator/assignee/customer) before upload. Counter + header + details inserted in one transaction; on transaction failure, uploaded R2 objects are best-effort cleaned up. If signed at creation, transitions immediately to `finished` (auto-email TODO §9). Technician's `created_by`/`assigned_to` forced to self; admin may set `assigned_to` to any user.
- [x] `GET /reports` — header-only list. Admin: full filter set. Technician: forced `assigned_to = self`. Filters: `status`, `client_id`, `assigned_to` (admin), `work_type`, `folio` (prefix `ILIKE`), `date_from`, `date_to` (against `date_arrival`). All zod-validated.
- [x] `GET /reports/:id` — header + details join. Permission-checked.
- [x] `PATCH /reports/:id` — editable only (`created`/`in-progress`). Updates header (`work_type`, dates, `client_id`) and/or details (`data` re-validated against the row's `report_type`). Bump to `in-progress` happens inside the same transaction. Cannot touch `assigned_to` (separate endpoint) or `created_by` (immutable).
- [x] `PUT /reports/:id/assignee` — admin only. Allowed in any status. Idempotent.
- [x] `PUT /reports/:id/signature` — multipart with `signature` (file or `signature_base64`) + `signed_by`. Calls `markFinished` (status → `finished`, sets `signed_at`, `finished_at`). Technician: assigned only. Allowed from `created` or `in-progress`.
- [x] `PUT /reports/:id/pictures` — append uploaded files to `details.pictures`. Bump to `in-progress`. Editable only.
- [x] `DELETE /reports/:id/pictures` — JSON body `{ urls: [...] }`. Removes from `details.pictures` and deletes R2 objects. Editable only.
- [x] `DELETE /reports/:id` — admin only. Soft-delete via `deleted_at`. All listing queries filter `WHERE deleted_at IS NULL`.
- [ ] `POST /reports/:id/email` and `GET /reports/:id/emails` — admin-only stubs (501) pending §9 redesign (now that public view links are out).
- [x] Smoke-tested locally: auth gates, role gates, folio/work_type/date_from/status filters all surface 400 on bad input and reach the DB layer on good input.

### 9. Email (Resend + token-bearer download link) ✅

**Final design.** Reports are never publicly browsable. Emails contain a **download link** to the report PDF; no attachments. The link route (`GET /reports/download/:token`) is *not* JWT-gated (external clients have no account) but is gated by an unguessable per-recipient token + expiry + revoke flag. It serves a *single artifact* — the PDF for one specific report — not a browsing surface. We do **not** track opens; the `report_emails` row is the audit trail that we sent the email.

Why we send at all: mailing the report to clients is a **billing requirement** — clients can't be invoiced until they've received the report.

Email triggers:
- **Automatic** when a report transitions to `finished` — sent to `customers.email` if present. Best-effort via `c.executionCtx.waitUntil(...)`; failure does not block signing.
- **Manual** via admin `POST /reports/:id/email` — for re-sends or sending to additional recipients.

**Hosting note:** PDF rendering will burn more than 10 ms of CPU per request. Plan to deploy on **Workers Standard ($5/mo)** before shipping this feature — the free tier's 10 ms CPU budget can't fit a multi-image PDF render. Standard's 30 s CPU budget is a comfortable ceiling. Single Worker project; promote PDF render to a dedicated Worker only if it ever exceeds ~5 s render time.

- [x] `lib/resend.ts`: thin fetch wrapper for `https://api.resend.com/emails` using `env.RESEND_API_KEY`. `sendEmail({ from, to, cc, subject, html, text, replyTo })` returns `{ id }`; throws on non-2xx.
- [x] `lib/access-token.ts`: cryptographically-strong token (`crypto.getRandomValues` → base64url, 32 bytes). The URL is the secret.
- [x] `lib/email-template.ts`: Spanish HTML + plain-text templates with `BRAND_LOGO_URL` / `BRAND_NAME` / `BRAND_SITE_URL` from env. Inline-styled, table-based, Outlook/Gmail/Apple Mail compatible. Brand colors: deep navy `#0c3a5e` on light gray. Timezone (`America/Monterrey`) disclosed via footnote.
- [x] `lib/pdf.ts`: server-side PDF renderer using **pdf-lib** (pure JS, ~250 KB, Workers-friendly). Mirrors the frontend's pdfmake `docDefinition` layout — title bar (customer | folio), customer info table, activities table, variant table (per `report_type`), 3-up picture grid, centered signature with caption. Renders via custom `drawRow`/`drawCellText` helpers since pdf-lib has no native table primitive.
- [x] `lib/report-labels.ts`: Spanish field labels per variant (kept in sync with zod schemas).
- [x] **Shared dispatch helper** `lib/dispatch-email.ts`:
  - Generates fresh access token; inserts `report_emails` row.
  - Builds the email body via `email-template.ts` with a link to `${API_BASE_URL}/reports/download/{token}`.
  - Sends via Resend.
  - On success: stores `resend_message_id`; calls `markMailed(reportId)` (no-op if already `mailed`). Returns `{ ok: true, email }`.
  - On failure: leaves the row with null `resend_message_id` for audit visibility. Returns `{ ok: false, error }`.
  - Used by both auto-send (signature path) and `POST /reports/:id/email` (admin path).
- [x] **Auto-send on finish** — invoked from the signature endpoint, wrapped in `c.executionCtx.waitUntil(...)` so signing returns immediately. If `customers.email` is empty/null, skip silently. `sentBy` is the user who signed.
- [x] `POST /reports/:id/email` — admin only. Body validated by `sendReportEmailSchema` (zod). Defaults `to` to `customers.email` if omitted; if customer also has no email, returns 400 `no_recipient`. Allowed only when status is `finished` or `mailed` (409 `report_not_ready` otherwise). Returns `{ emailId, sentAt }` on success, 502 `send_failed` on Resend failure.
- [x] `GET /reports/download/:token` — token-bearer, no JWT. Validates token (not revoked, not expired, parent not soft-deleted). Renders PDF on demand and returns with `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="<folio>.pdf"`, `Cache-Control: private, no-store`. Returns 410 Gone for invalid/expired/revoked tokens.
- [x] `GET /reports/:id/emails` — admin only. Returns the send history rows.
- [x] `POST /reports/emails/:emailId/revoke` — admin only. Sets `revoked_at`; future download attempts get 410.
- [x] Env: `RESEND_API_KEY` (secret), `RESEND_FROM` (var), `API_BASE_URL` (var), `BRAND_NAME`/`BRAND_SITE_URL`/`BRAND_LOGO_URL` (vars).
- [ ] DNS for Resend: SPF + DKIM records on the sending domain. Track as a deploy-time task in §11.
- [ ] **Hosting plan**: deploy on Workers Standard ($5/mo) before shipping. Verify PDF render fits within 30 s CPU budget on a representative report (10+ images, multi-page).
- [x] `PUBLIC_VIEW_URL` removed from `wrangler.toml`; replaced with `API_BASE_URL`.
- [x] Smoke-tested locally: download route bypasses JWT (reaches handler; fails on DB as expected); email send/history/revoke all gate properly (admin → DB, tech → 403); zod validation surfaces 400 on bad email shape.

### 10. Tests
- [ ] Vitest setup with `@cloudflare/vitest-pool-workers` so tests run inside the Workers runtime against bindings.
- [ ] Per-route happy-path test using Hono's `app.request()` + a Neon test branch.
- [ ] Zod-schema snapshot per response shape so the frontend contract is locked.
- [ ] Email flow: send-email path, public-view-with-valid-token, expired/revoked tokens, open is logged exactly once.

### 11. Deploy
- [ ] `wrangler deploy` to a staging Worker. Frontend points at the staging URL.
- [ ] Smoke test all 15 (+ email + view) endpoints from the deployed frontend.
- [ ] SPF + DKIM records configured on the Resend sending domain.
- [ ] Cut DNS / production env, decommission Vercel deployment, archive Firebase project.

---

## Out of scope for this branch
- Payments, queues, schedulers — none exist today, none added here.
- Real-time features (websockets/SSE) — not needed.
- Migration of legacy Firestore data — confirmed throwaway.
- PDF rendering for the email feature, *if* we go with "email a hosted link" instead of an attached PDF (decide alongside email provider).

---

## Open questions
- _(none — all design decisions resolved; ready to scaffold workstream 1.)_
