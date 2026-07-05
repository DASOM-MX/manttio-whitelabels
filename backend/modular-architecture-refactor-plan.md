# Backend Modular Architecture Refactor Plan

**Branch:** `feature/backend-modular-architecture`
**Goal:** Restructure `backend/src` from a layer-first layout (`routes/`, `db/`, `lib/`,
`validators/`, `middleware/`) into a **NestJS-like, module-first** layout where all logic for a
domain lives under its own module. Improves readability and consistency across modules.

> This is a **pure structural refactor** — no behavior, endpoint, schema, or DB migration
> changes. The live Neon DB stays current through migration `0008`; `pnpm db:generate` must
> report **no diff** at the end. If it doesn't, we broke something.

---

## 1. Principles

- **One module owns all of its logic** — controller (route), service (business logic),
  repository (queries), model (Drizzle table), types (zod + inferred), templates (pdf/email).
- **Thin controllers**: parse/validate → call a service → respond. All orchestration and
  business rules move into `services/`.
- **Cross-cutting concerns also become modules** (no `core/`/`shared/`/`common/` junk drawer) —
  `database/`, `storage/`, `email/`, `pdf/`. Micro-utilities fold into the domain module that owns
  them. A cross-cutting module must be **generic/reusable** (domain-agnostic); domain composition
  that *uses* it stays in the domain module (e.g. the `pdf/` toolkit draws tables/rows/images, while
  the report document layout stays in `reports/helpers/report-pdf.helpers.ts` and calls it — same
  split as `email/` transport vs `reports/` email composition).
- **Generic, reusable email transport** lives in its own `email/` module (`sendEmail` over Resend,
  provider-swappable). Report-specific email composition (bodies, tokens, send-log) stays in the
  `reports/` module and *calls* the `email/` service.
- **`models/` and `validators/` are distinct, both kept.** `models/` = **Drizzle DB tables**;
  `validators/` = **zod request schemas** (the schema objects only). Keeping them separate prevents
  "schema" from meaning two things.
- **`dtos/` holds output/response contracts only** — hand-written shapes that have **no zod
  equivalent** (e.g. `PublicUser`, which drops `password_hash`). **Request input types stay in
  `validators/`** as `z.infer` exports of their schema — they are *derived from* the validator, so a
  separate folder would just echo it. A module gets `dtos/` only when it maps responses to a custom
  shape; if it returns rows/tokens as-is, it has no `dtos/`.
- **`enums/` holds enum-like literal unions** and their value arrays (`ROLES`/`Role`,
  `workTypes`/`WorkType`, `reportTypes`/`ReportType`, `REPORT_STATUSES`/`ReportStatus`). Added only
  to modules that actually have enums.
- **`constants/` holds fixed constant values and config data** that are neither enums nor types —
  literal defaults and reference data a module depends on (e.g. `DEFAULT_MEXICAN_TIMEZONE` + the IANA
  timezone list in `customers/constants/timezones.ts`). An `enum/` is a closed union that also drives
  a TS type; a `constant/` is just a value (or table of values). Added only to modules that have such
  data.
- **`templates/` holds the static template asset (the markup), `helpers/` holds the renderer/
  formatter functions.** The template is *what* gets rendered (e.g. the report-email HTML markup +
  escaping in `reports/templates/report-email.html.ts`); the helper is *how* — it computes the
  display values and fills the template (`reports/helpers/report-email.helpers.ts`). **HTML/markup
  blobs never sit inline in a helper** — they live in `templates/` and the helper delegates to them.
  A renderer with no separate markup asset (e.g. the pdf-lib drawing code) is a helper with no
  matching template. `helpers/` files use the `.helpers.ts` suffix; they differ from `utils/` (small
  generic pure utilities) by being domain output renderers/formatters.
- **`types/` holds internal TS types** that are none of the above — DB row aliases
  (`$inferSelect`/`$inferInsert` like `UserRow`, `ReportRow`) and service/repository param & filter
  types (`ReportFilters`, `UpdateUserFields`, `SignedLocation`).
- **`http-errors/` holds custom error classes that a controller maps to an HTTP status** — one
  class per file (e.g. `NotAnImageError` → 415). Services `throw` them; the controller catches and
  translates (`instanceof` → `c.json`). Added only to modules that need a typed, HTTP-mapped error.
- **Create only the folders a module needs** — not every module has `enums/`, `templates/`,
  `helpers/`, `models/`, `http-errors/`, or `middleware/`. No empty folders.
- **`middleware/` only where necessary** — not part of the standard anatomy. A module gets one only
  if it actually provides Hono middleware. Today that is **only `auth/`** (jwt + roles). There is no
  top-level `middleware/`.

---

## 2. Target structure

```
src/
  index.ts                       # bootstrap: mounts each module's controller + global middleware
  env.ts                         # typed Env bindings + AuthUser (global, unchanged)
  modules/
    auth/
      controllers/auth.controller.ts
      services/auth.service.ts            # login orchestration
      services/password.service.ts        # bcrypt hash/verify   (was lib/password.ts)
      services/jwt.service.ts             # jose sign + TTL       (was lib/jwt.ts)
      middleware/jwt.middleware.ts        # (was middleware/jwt.ts)
      middleware/roles.middleware.ts      # (was middleware/roles.ts)
      validators/auth.validator.ts        # loginSchema + LoginInput (z.infer)   (was validators/auth.ts)
      # no dtos/ — login returns { token }
    users/
      controllers/users.controller.ts
      services/users.service.ts
      repository/users.repository.ts      # (was db/repositories/users.ts)
      models/users.model.ts               # users Drizzle table   (from db/schema.ts)
      validators/users.validator.ts       # create/update/delete zod + inferred inputs (was validators/users.ts)
      dtos/users.dto.ts                    # PublicUser (response shape — no zod equivalent)
      types/users.types.ts                # UserRow/NewUser/UpdateUserFields (DB/internal)
      enums/users.enum.ts                  # ROLES / Role
    customers/
      controllers/customers.controller.ts
      services/customers.service.ts
      repository/customers.repository.ts
      models/customers.model.ts
      validators/customers.validator.ts   # zod + inferred inputs  (returns rows as-is → no dtos/)
      types/customers.types.ts            # CustomerRow/NewCustomer/UpdateCustomerFields
      constants/timezones.ts              # customer TZ source of truth (was lib/timezones.ts)
    reports/
      controllers/reports.controller.ts
      services/reports.service.ts         # create/patch/sign/pictures/list/delete orchestration
      services/report-email.service.ts    # compose + dispatch report email (was lib/dispatch-email.ts)
      repository/reports.repository.ts
      repository/report-emails.repository.ts
      models/reports.model.ts             # reports, reportDetails, reportCounters Drizzle tables
      models/report-emails.model.ts       # reportEmails Drizzle table
      validators/reports.validator.ts     # variant zod + *Data inputs + validateReportData (was validators/reports.ts)
      validators/reports-routes.validator.ts # create/patch/sign/list zod + CreateReportMeta/PatchReportInput (was validators/reports-routes.ts)
      validators/report-email.validator.ts   # sendReportEmailSchema + SendReportEmailInput (was validators/email.ts)
      # no dtos/ — endpoints return report rows / joined {report,details} as-is
      enums/reports.enum.ts                # WorkType/ReportType/ReportStatus + value arrays
      types/reports.types.ts              # ReportRow/ReportDetailRow/NewReport aliases, ReportFilters, SignedLocation
      templates/report-email.html.ts      # report-email HTML markup + escaping (the template asset)
      helpers/report-pdf.helpers.ts        # report document LAYOUT; composes the pdf/ toolkit (was lib/pdf.ts)
      helpers/report-email.helpers.ts      # computes values, fills templates/report-email.html.ts (was lib/email-template.ts)
      helpers/report-labels.helpers.ts     # Spanish field labels + formatters (was lib/report-labels.ts)
      utils/report-id.ts                  # (was lib/report-id.ts)
      utils/access-token.ts               # (was lib/access-token.ts)
      utils/report-lifecycle.ts           # isEditableStatus/isFinishedOrMailed (was lib/report-lifecycle.ts)
      utils/report-access.ts              # canAccess predicate (admin | own assigned report)
    upload/
      controllers/upload.controller.ts
      services/upload.service.ts
      http-errors/not-an-image.error.ts   # NotAnImageError (controller maps → 415)
    email/                                # reusable transport
      services/email.service.ts           # sendEmail over Resend, swappable (was lib/resend.ts)
      types/email.types.ts                # ResendSendParams etc.
    pdf/                                  # generic PDF toolkit (domain-agnostic; reusable)
      services/pdf.service.ts             # createRenderer + tables/rows/section headers/image grid/image embed
      constants/pdf-layout.ts             # page geometry + default theme colors (whitelabel-parameterizable later)
      types/pdf.types.ts                  # Cell, Renderer
    storage/                              # R2 + multipart helpers
      services/storage.service.ts         # (was lib/r2.ts)
      utils/form-data.ts                  # fdGet/fdGetAll/isFile (was lib/form-data.ts)
    database/                             # infra
      client.ts                           # neon-serverless + drizzle (was db/client.ts)
      schema.ts                           # BARREL — re-exports every module's tables + all relations
      db-errors.ts                        # (was lib/db-errors.ts)
```

**Deleted after migration:** `src/routes/`, `src/db/`, `src/lib/`, `src/middleware/`,
`src/validators/`.

### Naming conventions

| Folder | Suffix | Holds |
|---|---|---|
| `controllers/` | `.controller.ts` | Hono router for the module (thin) |
| `services/` | `.service.ts` | business logic / orchestration |
| `repository/` | `.repository.ts` | Drizzle queries & mutations |
| `models/` | `.model.ts` | **Drizzle DB table** definitions (entities) |
| `validators/` | `.validator.ts` | **zod** request schemas **+ their `z.infer` input types** |
| `dtos/` | `.dto.ts` | **output/response** shapes with no zod equivalent (e.g. `PublicUser`) |
| `enums/` | `.enum.ts` | literal unions + value arrays (`Role`, `WorkType`, `ReportStatus`) |
| `constants/` | plain `.ts` | fixed values / reference data (timezone list + default) |
| `http-errors/` | `.error.ts` | custom error classes a controller maps to an HTTP status (`NotAnImageError` → 415) |
| `types/` | `.types.ts` | internal TS types (DB row aliases, service/filter params) |
| `templates/` | content suffix (e.g. `.html.ts`) | static template asset / markup that a helper renders (report-email HTML) |
| `helpers/` | `.helpers.ts` | domain renderer/formatter functions (pdf / email / label renderers) |
| `utils/` | plain `.ts` | small generic pure helpers (id gen, tokens, lifecycle predicates) |
| `middleware/` | `.middleware.ts` | Hono middleware — **`auth/` only** |

> `models/` (DB tables) and `validators/` (zod) are deliberately separate so "schema" never refers
> to both. **Request inputs stay with their validator** (they're just its `z.infer`); `dtos/` is
> reserved for **outputs** that have no validator (`PublicUser`). `enums/` = literal unions,
> `constants/` = fixed values / reference data, `types/` = everything else. Create a folder only when
> the module has content for it — several modules will have **no `dtos/`** at all.

---

## 3. Key structural decisions

### 3.1 Schema barrel (keeps `drizzle-kit` working)
- Each module's `models/*.model.ts` defines only its **tables**. Cross-table FK references
  point at other modules' table objects via import — the dependency graph is **acyclic**:
  `reports.model → users.model, customers.model`; `report-emails.model → reports.model, users.model`;
  `users.model`/`customers.model` import nothing.
- **All Drizzle `relations()`** (which are inherently cyclic: users↔reports↔customers↔emails) live
  in the barrel `database/schema.ts`, NOT in the model files — this avoids circular imports between
  models.
- `database/schema.ts` re-exports every table + defines the relations. `database/client.ts` keeps
  `import * as schema from './schema'` so `drizzle(pool, { schema })` still sees tables + relations.
- **`drizzle.config.ts`**: change `schema: './src/db/schema.ts'` → `'./src/modules/database/schema.ts'`.

### 3.2 Cross-module service calls
- `reports.service` and `report-email.service` look up users/customers via the **repositories**
  of those modules (e.g. `usersRepository.findUserById`, `customersRepository.findCustomerById`) —
  same as today, just relocated. No circular service dependency is introduced.
- `report-email.service` (domain) calls `email.service.sendEmail` (generic transport).

### 3.3 Transition shims (strangler pattern)
- To keep the build green after **every** phase without rewriting the still-old consumers twice,
  each moved file leaves a **temporary re-export shim** at its old path
  (e.g. `src/lib/r2.ts` → `export * from '../modules/storage/services/storage.service'`).
- Old code keeps importing the old path (unchanged); new modules are canonical.
- **All shims are deleted in Phase 10**, once every consumer imports from the new path.
- Phase 1 also stubs `modules/database/schema.ts` as a passthrough (`export * from '../../db/schema'`)
  until Phase 2 makes it the real barrel.

### 3.4 What stays put
- `src/env.ts` — global bindings/`AuthUser`, imported everywhere; stays at `src/` root.
- `src/index.ts` — the composition root/bootstrap; stays at `src/` root, rewired to import
  controllers from `modules/*/controllers` and middleware from `auth/middleware`.

---

## 4. File-by-file move map

| Current | New |
|---|---|
| `routes/auth.ts` | `modules/auth/controllers/auth.controller.ts` (+ `services/auth.service.ts`) |
| `routes/users.ts` | `modules/users/controllers/users.controller.ts` (+ `services/users.service.ts`) |
| `routes/customers.ts` | `modules/customers/controllers/customers.controller.ts` (+ service) |
| `routes/reports.ts` | `modules/reports/controllers/reports.controller.ts` (+ `services/reports.service.ts`) |
| `routes/upload.ts` | `modules/upload/controllers/upload.controller.ts` (+ service) |
| `middleware/jwt.ts` | `modules/auth/middleware/jwt.middleware.ts` |
| `middleware/roles.ts` | `modules/auth/middleware/roles.middleware.ts` |
| `db/client.ts` | `modules/database/client.ts` |
| `db/schema.ts` | split into module `models/` + `modules/database/schema.ts` (barrel + relations) |
| `db/repositories/users.ts` | `modules/users/repository/users.repository.ts` |
| `db/repositories/customers.ts` | `modules/customers/repository/customers.repository.ts` |
| `db/repositories/reports.ts` | `modules/reports/repository/reports.repository.ts` |
| `db/repositories/report-emails.ts` | `modules/reports/repository/report-emails.repository.ts` |
| `validators/auth.ts` | `modules/auth/validators/auth.validator.ts` |
| `validators/users.ts` | `modules/users/validators/users.validator.ts` |
| `validators/customers.ts` | `modules/customers/validators/customers.validator.ts` |
| `validators/reports.ts` | `modules/reports/validators/reports.validator.ts` |
| `validators/reports-routes.ts` | `modules/reports/validators/reports-routes.validator.ts` |
| `validators/email.ts` | `modules/reports/validators/report-email.validator.ts` |
| `lib/password.ts` | `modules/auth/services/password.service.ts` |
| `lib/jwt.ts` | `modules/auth/services/jwt.service.ts` |
| `lib/db-errors.ts` | `modules/database/db-errors.ts` |
| `lib/r2.ts` | `modules/storage/services/storage.service.ts` |
| `lib/form-data.ts` | `modules/storage/utils/form-data.ts` |
| `lib/resend.ts` | `modules/email/services/email.service.ts` (+ `types/email.types.ts`) |
| `lib/timezones.ts` | `modules/customers/constants/timezones.ts` |
| `lib/report-lifecycle.ts` | `modules/reports/types/report-lifecycle.ts` |
| `lib/report-id.ts` | `modules/reports/utils/report-id.ts` |
| `lib/access-token.ts` | `modules/reports/utils/access-token.ts` |
| `lib/dispatch-email.ts` | `modules/reports/services/report-email.service.ts` |
| `lib/email-template.ts` | `modules/reports/helpers/report-email.helpers.ts` (+ `templates/report-email.html.ts` for the markup) |
| `lib/pdf.ts` | split: generic toolkit → `modules/pdf/` (service + constants + types); report layout → `modules/reports/helpers/report-pdf.helpers.ts` |
| `lib/report-labels.ts` | `modules/reports/helpers/report-labels.helpers.ts` |

**Consumers to update (imports only):**
- `test/*.test.ts` + `test/helpers/*` — import `../../src/db/*`, `../../src/lib/*`,
  `../../src/validators/reports`, `../../src/index`.
- `scripts/seed-admin.ts` — imports `../src/db/schema`.
- `drizzle.config.ts` — schema path.

---

## 5. Checkpoints

Legend: `[ ]` todo · `[~]` in progress · `[x]` done. Each **GATE** must pass before moving on.

### Phase 0 — Setup
- [x] Create branch `feature/backend-modular-architecture`.
- [x] Rename stale `hono-refactor-plan.md` → `LEGACY-hono-refactor-plan.md`.
- [x] Write this plan.

### Phase 1 — Infra modules (`database`, `storage`, `email`)
- [x] `modules/database/client.ts`, `db-errors.ts` moved; `client.ts` imports `./schema` (stub barrel).
- [x] `modules/storage/services/storage.service.ts` + `utils/form-data.ts` moved.
- [x] `modules/email/services/email.service.ts` + `types/email.types.ts` moved (generic transport).
- [x] Passthrough stub `modules/database/schema.ts` created (→ Phase 2 turns it into the real barrel).
- [x] Re-export shims left at old paths: `db/client.ts`, `lib/db-errors.ts`, `lib/r2.ts`,
      `lib/form-data.ts`, `lib/resend.ts`.
- [x] **GATE:** `pnpm typecheck` clean.

### Phase 2 — Models + schema barrel
- [x] `users/models/users.model.ts`, `customers/models/customers.model.ts`,
      `reports/models/reports.model.ts`, `reports/models/report-emails.model.ts` created from `db/schema.ts`.
- [x] `modules/database/schema.ts` barrel re-exports all tables + holds every `relations()`.
- [x] `db/schema.ts` turned into a re-export shim (→ barrel). Removed in Phase 10.
- [x] `drizzle.config.ts` schema path updated to `./src/modules/database/schema.ts`.
- [x] **GATE:** `pnpm typecheck` clean · `pnpm db:generate` → "No schema changes, nothing to migrate".

### Phase 3 — `auth` module
- [x] `password.service.ts`, `jwt.service.ts`, `jwt.middleware.ts`, `roles.middleware.ts`,
      `validators/auth.validator.ts` (incl. `LoginInput`) moved. No `dtos/`.
- [x] `auth.service.ts` extracts login logic (`login()` → token | null); `auth.controller.ts` thin.
- [x] Re-export shims left at old paths: `routes/auth.ts`, `lib/password.ts`, `lib/jwt.ts`,
      `middleware/jwt.ts`, `middleware/roles.ts`, `validators/auth.ts`. Removed in Phase 10.
- [x] **GATE:** `pnpm typecheck` clean.

### Phase 4 — `users` module
- [x] repository moved; `validators/users.validator.ts` (zod + inferred inputs) + `dtos/users.dto.ts`
      (**`PublicUser` + `toPublicUser` only**) + `enums/users.enum.ts` (`ROLES`/`Role`) +
      `types/users.types.ts` (`UserRow`/`NewUser`/`UpdateUserFields`) split out.
- [x] `users.service.ts` extracted (hash, uniqueness→`EmailInUseError`→409, self-delete guard→
      `CannotDeleteSelfError`→400); controller thin (validate → service → respond, maps errors).
- [x] `auth.service` repointed to the new users repository (was the `db/repositories/users` shim).
- [x] Re-export shims left at `db/repositories/users.ts`, `validators/users.ts`, `routes/users.ts`.
- [x] **GATE:** `pnpm typecheck` clean.

### Phase 5 — `customers` module
- [x] repository + `constants/timezones.ts` moved; `validators/customers.validator.ts` (zod + inferred
      inputs) + `types/customers.types.ts` split out (**no `dtos/`** — returns rows as-is);
      `customers.service.ts` extracted (patch field-building + CRUD orchestration); controller thin.
- [x] Re-export shims left at `lib/timezones.ts`, `db/repositories/customers.ts`,
      `validators/customers.ts`, `routes/customers.ts`. Reports templates still read the
      `lib/timezones` shim until Phase 7. Removed in Phase 10.
- [x] **GATE:** `pnpm typecheck` clean.

### Phase 6 — `upload` module
- [x] `upload.service.ts` (validate image → `NotAnImageError`→415, store via storage.service)
      extracted; `upload.controller.ts` thin (parse form → no_file 400 → service → respond).
- [x] `http-errors/not-an-image.error.ts` holds `NotAnImageError` (own file/folder); the service
      throws it, the controller maps it to 415. First use of the `http-errors/` folder.
- [x] Re-export shim left at `routes/upload.ts`. Removed in Phase 10.
- [x] **GATE:** `pnpm typecheck` clean.

### Phase 7 — `reports` module (largest)
- [x] repositories (`reports`, `report-emails`), models (`reports`, `report-emails`), validators
      (`reports`, `reports-routes`, `report-email`) — **incl. inferred inputs + `*Data` shapes**,
      `enums/reports.enum.ts` (`workTypes`/`WorkType`, `reportTypes`/`ReportType`,
      `REPORT_STATUSES`/`ReportStatus`), `types/reports.types.ts` (row aliases, `ReportFilters`,
      `SignedLocation`), utils (`report-id`, `access-token`, `report-lifecycle`, `report-access`),
      templates (`report-pdf`, `report-email`, `report-labels`) moved. **No `dtos/`** — endpoints
      return rows / `{report,details}` as-is. `reports.model` repointed to import `WorkType` from the enum.
- [x] `report-email.service.ts` (was `dispatch-email`) calls `email.service` + reports/users/customers repos.
- [x] `reports.service.ts` holds create/patch/sign/pictures/list/delete/email orchestration + R2
      upload/cleanup + PDF-for-token assembly; returns `{ status, body }` results the controller relays.
- [x] `reports.controller.ts` thin: validate → service → `c.json(body, status)`; `/download/:token`,
      `/:id/email`, history, revoke, editable-gate error precedence preserved.
- [x] Review follow-up: the pure `canAccess` authorization predicate moved from `reports.service`
      into `utils/report-access.ts` (alongside the other pure predicates). No `http-errors/` folder —
      reports has no controller-mapped typed error classes (it uses `{ status, body }` results; the
      `throw new Error(...)` cases are internal invariants → 500).
- [x] Review follow-up: split the rendering layer into `templates/` (markup) + `helpers/` (functions).
      The renderer functions moved `templates/*.template.ts` → `helpers/*.helpers.ts`
      (`report-pdf`, `report-email`, `report-labels`); the report-email HTML markup + escaping lives
      in `templates/report-email.html.ts`, which `helpers/report-email.helpers.ts` fills. Convention:
      HTML/markup templates live in `templates/`, renderers/formatters in `helpers/` (`.helpers.ts`).
- [x] Review follow-up: extracted the **generic PDF toolkit** into a new cross-cutting `pdf/` module
      (`services/pdf.service.ts` — createRenderer + tables/rows/section headers/image grid/image embed;
      `constants/pdf-layout.ts` — geometry + default theme; `types/pdf.types.ts` — `Cell`/`Renderer`).
      `reports/helpers/report-pdf.helpers.ts` keeps only the report document layout and composes the
      toolkit. Enables reuse + eventual whitelabel/per-client PDF customization. Output byte-identical.
- [x] Re-export shims left at all 13 old paths (routes/reports, db/repositories/{reports,report-emails},
      validators/{reports,reports-routes,email}, lib/{dispatch-email,email-template,pdf,report-labels,
      report-id,access-token,report-lifecycle}). Removed in Phase 10.
- [x] **GATE:** `pnpm typecheck` clean · `pnpm db:generate` → "No schema changes, nothing to migrate".

### Phase 8 — Bootstrap
- [x] `src/index.ts` imports controllers from `modules/*/controllers` + `jwtMiddleware` from
      `auth/middleware`; mount order, JWT prefixes, `onError`/`notFound` preserved. No shim imports left
      in the composition root.
- [x] **GATE:** `pnpm typecheck` clean.

### Phase 9 — Consumers
- [x] `test/{auth,users,customers}.test.ts` + `test/helpers/fixtures.ts` imports repointed to
      `modules/database/{client,schema}`, `modules/{users,customers}/repository`,
      `modules/auth/services/password.service`, `modules/reports/enums/reports.enum`
      (`ReportStatus`/`WorkType`). `test/helpers/request.ts` keeps `src/index` (unchanged).
- [x] `scripts/seed-admin.ts` schema import repointed to `modules/database/schema`.
- [x] **GATE:** `pnpm typecheck` clean (covers `test/**`); no old-layer imports remain in test/ or scripts/.

### Phase 10 — Cleanup + typecheck
- [x] Deleted `src/routes/`, `src/db/`, `src/lib/`, `src/middleware/`, `src/validators/` (all shims).
      `src/` now holds only `env.ts`, `index.ts`, `modules/` (+ the empty `report-images/` asset dir).
- [x] **GATE:** `pnpm typecheck` passes with zero errors (covers `src/**` + `test/**`).
- [x] `grep` for stale imports of the old layer dirs → none.

### Phase 11 — Docs
- [x] Updated `backend/CLAUDE.md`: added a "Module layout" section; repointed routing/auth/database/
      validation/uploads/email+PDF/conventions references to the module paths; bumped state date.
- [x] Updated root `CLAUDE.md` "Where things live in backend/" to the module-first layout; bumped date.

### Phase 12 — Final verification
- [x] **GATE:** `pnpm typecheck` clean · `pnpm db:generate` → "No schema changes, nothing to migrate".
- [x] Endpoint surface unchanged — same routes mounted in the same order in `index.ts` (Phase 8).
- [ ] Optional `pnpm dev` smoke skipped (needs the live Worker + Neon DB) — left to the user.
- [x] Handed off to user for review. (Tests hit live Neon — run only with user's OK.)

---

## ✅ Refactor complete

All 12 phases done, one stacked PR each (#1 base `main` → #12 base #11). `src/` is now
`env.ts` + `index.ts` + `modules/` only; every domain owns its full stack and the cross-cutting
concerns (`database`, `storage`, `email`, `pdf`) are their own modules. Every phase was a pure
structural move verified by `pnpm typecheck` (and `pnpm db:generate` no-diff where schema files
moved). Merge the PR stack **bottom-up** (#1 first); re-check each PR's base before merging since
GitHub does not auto-retarget a stack after the parent merges.

**Post-phase refinements** (added during PR review, mostly on #6/#7): the `http-errors/` folder
(`upload/http-errors/not-an-image.error.ts`); `constants/` for reference values; the `templates/`
(markup) + `helpers/` (`.helpers.ts` renderers) split for the reports rendering layer; the generic
`pdf/` toolkit module (report layout stays in `reports/helpers/`); and `canAccess` → `reports/utils/
report-access.ts`. All behavior-preserving; docs updated in the taxonomy above + both `CLAUDE.md`.

---

## 6. Verification gates (summary)
1. **No schema diff** — `pnpm db:generate` after Phase 2 and Phase 12.
2. **Typecheck clean** — `pnpm typecheck` after Phase 10 and Phase 12.
3. **No stale imports** — grep the old layer dirs return nothing.
4. **Endpoint surface unchanged** — same routes mounted in the same order in `index.ts`.

## 7. Risks & notes
- **Circular imports between models** if relations are co-located — mitigated by putting all
  `relations()` in the barrel (§3.1).
- **`drizzle-kit` schema path** — easy to forget; it's the Phase 2 gate.
- **Tests hit the live Neon DB** — do not run `pnpm test` casually; the typecheck + `db:generate`
  gates are the safe verification. Full test run only with the user's go-ahead.
- **One-pass execution** per the user's call — reviewed in full at the end, not per module.
