# 21 — List pagination (clients + catalog server-side paging)

> **Status:** in progress — **CP-1…CP-5 done** (CP-1…CP-3 merged 2026-08-25; CP-4 closed
> 2026-08-27; CP-5 built 2026-08-27 on `feature/fullstack-services-pagination`). The reported
> bug is fixed and verified against the live backend: the clients, leads and blacklist views
> all page, and page 2 renders page-2 rows. The services catalog is now paged too, and 18 §4's
> no-pagination decision is formally superseded. **CP-6 (the Playwright regression guard)
> remains**, plus the standing wrapper backlog in §9 (opened 2026-08-27, owner) — worked one
> slice per PR, never batched.
> **Depends on:** 07 (clients), 18 (services) · **Touches:** `backend/`, `superadmin/`, `frontend/`
> **Owner:** — · **Last updated:** 2026-08-25

Fixes the reported bug: **on the clients list, moving to any page never changes the
rows.** The investigation (below) found the frontend pagination layer to be correct and
the cause to be a single unimplemented backend contract — `GET /customers` was specified
as paged in **07 §2** and never built that way. The same work converts the services
catalog list to server-side paging (§6), which 18 §4 had deliberately left client-side,
and unifies every list response behind one generic envelope (§2).

The dangerous part of this fix is **not** the paging itself: it is that a dozen customer
and service *pickers* across superadmin and the field app silently depend on those two
endpoints returning every row. Honouring `page`/`limit` without migrating them first
truncates a 1000+ client roster to 100 — or, in one case, to 10. §5 is that inventory and
CP-2/CP-3 exist to close it before CP-4 flips the switch.

---

## Decisions (2026-08-25)

Answers to the scope forks raised before this plan was written:

1. **Field-app compatibility → dedicated roster endpoint.** `GET /customers` becomes the
   paged list; a new `GET /customers/all` serves the whole roster as a compact projection
   for the field app's offline picker. No dual-shaped route, no transitional `{ customers }`
   fallback.
2. **Services catalog → convert to server-side paging** (§6), with the same roster split.
   This **supersedes 18 §4's** "no pagination (catalog-sized)" decision. CSV import (18 §6.3)
   makes an unbounded catalog fetch a matter of time.
3. **Regression guard → backend Vitest + Playwright e2e.** Per-module repository tests ride
   with the code they cover (CP-4, CP-5); a cross-page e2e spec asserting "page 2 renders
   page-2 rows" lands as CP-6.
4. **One generic envelope — `GenericQueryResponse<T>`** (§2). Every paginated/query
   response — backend repository, backend service, and both Angular clients — uses the
   single generic instead of the ~20 hand-written shapes that exist today. Named exactly
   `GenericQueryResponse<T>`; `PagedResponse<T>` is renamed into it, not kept as an alias.

### Amendment (2026-08-25) — roster endpoints return a bare array

Decision 1 above shipped `GET /customers/all` and `GET /services/all` as `{ items: T[] }`.
Owner, on seeing the live response: *"too nested, make it one level object array only."*
Both now return `CustomerOption[]` / `ServiceOptionDTO[]` directly.

The reasoning that made these *not* a `GenericQueryResponse` applies one step further: with
no page and no limit, a `total` could only restate the array's own length, so the `{ items }`
wrapper carries no information either. Query reads keep the envelope; roster reads are a
plain array. Consumers updated in the same change: both superadmin http services + their
NGXS roster actions, and the field app's `customers.service.ts` + `customers.state.ts`.

---

## 1. Root cause

`backend/src/modules/customers/controllers/customers.controller.ts:48` — the list route has
no validator and no query at all:

```ts
customers.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json({ customers: await getCustomers(db) });   // → listCustomers(db), every live row
});
```

Three layers then compound into the exact reported symptom:

1. **Backend** returns every non-deleted customer, ignoring `page`, `limit`, `search`,
   `status`, `source` and `tags`.
2. **Superadmin adapter** fakes the envelope — `superadmin/src/app/services/http/customers.service.ts:101`
   returns `{ items, total: items.length, page: 1, limit: items.length }`, so `total()` is
   the *whole* row count and the paginator renders a plausible page count.
3. **PrimeNG** (`primeng-table.mjs:1528`) does
   `const first = this.lazy ? 0 : this.first` — **in lazy mode it always slices `[0, rows)`**,
   trusting the server to have paged.

Net effect: every page click refetches the identical full list and re-renders rows 0–9.

**Verified by repro** (Playwright, throwaway): clicking page 2 on `/customers` navigated to
`?page=2`, issued `GET /customers?page=2&limit=10`, and left the first row as `Cliente0`.
The same repro against `/users` — whose backend *is* paged — correctly rendered page-2 rows.

### What is NOT broken

`ListQueryService` (`superadmin/src/app/services/table/list-query.service.ts`) is correct:
the `queryParamMap` subscription as single load path, page clamping, the `[first]` offset,
filter→URL navigation and `onLazyLoad` all behave. **No change is needed there.** Same for
the NGXS states and the `[lazy]`/`[first]`/`[totalRecords]` bindings on the list templates.

### Endpoint audit (all nine list pages)

| List page | Backend pages? | Returns real `total`? | Status |
|---|---|---|---|
| users | yes | yes | ok (repro-verified) |
| reports | yes | yes | ok |
| quotations | yes | yes | ok |
| contracts | yes | yes | ok |
| equipment | yes | yes | ok |
| service-orders | yes | yes | ok |
| report-templates | yes | yes | ok |
| **customers** (+ leads, blacklist) | **no** | **no — faked** | **broken (this plan)** |
| services catalog | n/a — non-lazy | n/a | works client-side; converted in §6 |

The clients list's `search` / `status` / `source` / `tags` filters are sent and discarded
server-side too — same missing query layer, fixed by the same change.

---

## 2. Response envelope — `GenericQueryResponse<T>`

**Decision (2026-08-25):** every paginated/query response uses one generic type. Today the
same shape is hand-written ~20 times in three variants, which is how the clients list came
to fake its own `total` without anything noticing.

### The duplication being removed

| Where | Shape | Count |
|---|---|---|
| backend repositories + services (inline, unnamed) | `{ items: T[]; total: number }` | 12 |
| backend services (inline, unnamed) | `{ items: T[]; total: number; page: number; limit: number }` | 3 |
| backend notifications repository | `{ items, total, unreadCount }` inline, plus the controller re-assembling `{ items, total, unreadCount, page, limit }` by hand | 2 |
| superadmin `data/dtos/notification.ts` | `NotificationListResponse` — all five fields hand-written | 1 |
| superadmin `data/dtos/paged-response.ts` | `PagedResponse<T>` | 1 (used by 8 services) |
| superadmin `quotations.service.ts` | inline `{ items, total }` — drifted, no `page`/`limit` | 4 |
| field app `dtos/report/report-list-response.dto.ts` | `ReportListResponse` | 1 |
| field app `dtos/report-template/…` **and** `types/report-template/…` | `ReportTemplateListResponse`, **defined twice** | 2 |

### The type

```ts
export interface GenericQueryResponse<T> {
  items: T[];
  total: number;   // matches the filter, NOT the page length
  page: number;
  limit: number;
}
```

- **`total` is the filtered count, never `items.length`.** That equation is exactly the bug
  in §1; a reviewer seeing `total: items.length` should treat it as a defect.
- **Extensions derive into a named type, they don't fork and they don't stay inline.**
  An envelope that carries extra fields gets its own `*QueryResponse` interface extending
  the generic, declared once in the owning module — never an intersection spelled out at
  each use site (decided 2026-08-25). Notifications is the only case today:

  ```ts
  // backend/src/modules/notifications/types/notifications.types.ts
  export interface NotificationQueryResponse extends GenericQueryResponse<NotificationView> {
    /** Badge count for the whole recipient scope — independent of `page`/`status`,
     *  so it is NOT derivable from `items` or `total`. */
    unreadCount: number;
  }
  ```

  `extends` rather than `&`: the derivation is the point, it is what a reader sees first,
  and a mismatch reports against the named type instead of an anonymous intersection.
  The superadmin twin lives in `data/dtos/notification.ts` and derives the same way —
  today's hand-written `NotificationListResponse` (all five fields spelled out) is
  **renamed** to `NotificationQueryResponse` and re-derived, so both packages carry one
  name for one shape. The field app has no notifications surface, so it is unaffected.
- **Nullable reads** stay `GenericQueryResponse<T> | null` (e.g. `service-orders.service.ts:181`)
  — absence is not a shape variant and needs no derived type.
- **Repositories return the full envelope too.** All 12 already receive `page` and `limit`
  as arguments, so echoing them is mechanical — and it is what keeps this to *one* type
  instead of a wire type plus an internal `{ items, total }` twin.

### Where it lives

Three independently-deployed packages with no shared workspace lib, so one definition per
package — same name, same shape, each following its package's own file convention.

| Package | File | Note |
|---|---|---|
| `backend/` | `src/modules/shared/types/generic-query-response.types.ts` | New `shared` module. `src/` may hold only `env.ts`, `index.ts` and `modules/` (root CLAUDE.md), so a cross-cutting type has to be a module; `env.ts` is bindings, not response shapes. Plural `.types.ts` — every other backend type file is (CP-1). |
| `superadmin/` | `src/app/data/dtos/generic-query-response.ts` | Renames `paged-response.ts`; interface renamed with it. |
| `frontend/` | `src/app/data/dtos/generic-query-response.dto.ts` | Replaces `ReportListResponse` and both copies of `ReportTemplateListResponse`. |

No barrels — import the concrete file directly.

---

## 3. API contract — customers

### `GET /customers` → paged

```
GET /customers?page&limit&search&status&source&tags
  → GenericQueryResponse<Customer>
```

Matches **07 §2** (already specified) and the `users` precedent exactly.

- `listCustomersQuerySchema` in `customers/validators/customers.validator.ts`:
  `page` (coerce, int, min 1, default 1), `limit` (coerce, int, min 1, **max 100**, default 10),
  `search`, `status` (`z.nativeEnum(CustomerStatus)`), `source` (`z.nativeEnum(CustomerSource)`),
  `tags` — arrives comma-joined from the client, so `.transform()` it into `string[]` in the
  schema rather than splitting in the service.
- Enums come from `customers/enums/customers.enum.ts` — they are already TS enums, so
  `z.nativeEnum` is the right validator (repo rule: backend enums are TS enums).
- Role gate unchanged: reads stay open to any authenticated user.

### `GET /customers/all` → roster (new)

```
GET /customers/all
  → CustomerOption[]                   // whole live roster, name-sorted, never paged
```

- Deliberately **not** a `GenericQueryResponse` — there is no page, no limit, and no
  meaningful `total` beyond `items.length`. Roster reads are a different contract from
  query reads, and giving them a fake envelope is what §1 warns about.
- **Must be registered before `GET /:id`** — same trap the controller already documents for
  `/stats/intake`, `/follow-ups`, `/recent` and `/interactions/recent`.
- Projection (**widened at CP-2 after the verification pass**):
  `{ id, name, contactName, razonSocial, identification, phone, email, state, status, timezone }`.
  The two additions are load-bearing and were missing from the original list:
  `timezone` — `frontend/.../reports/pages/reports/reports.ts:81` builds
  `id → { name, timezone }` off the roster and formats every report date with it, so
  without it every date silently falls back to the default zone; and `razonSocial` —
  `frontend/.../customers/pages/customers/customers.ts:54` folds it into the directory's
  search haystack. Everything else was confirmed in use: the field-app table renders
  `identification, phone, state`, its search also covers `email`, the report-add picker
  filters `name,identification`, and every superadmin picker maps `{ label: c.name, value: c.id }`.
  Widen this rather than making a picker fetch full rows.
- Same open read gate as `GET /customers` (the field app calls it as a technician).
- Soft-delete rule unchanged — `isNull(deletedAt)` on every read.

---

## 4. Repository & service layer — customers

`customers/repository/customers.repository.ts`:

- **`listCustomersPaged(db, query)` → `GenericQueryResponse<CustomerRow>`**, mirroring
  `listUsersPaged` (`users/repository/users.repository.ts:29`) — build a `SQL[]` filter
  list, one `select` with `.limit()/.offset()`, one `count(*)::int` over the same `where`.
  - always `isNull(customers.deletedAt)`
  - `status` / `source` → `eq(...)`
  - `search` → `or(ilike(...))` across `name`, `contactName`, `email`, `phone`,
    `identification`
  - `tags` → `arrayOverlaps(customers.tags, tags)` (confirmed present in drizzle-orm 0.36.4)
  - `orderBy(desc(customers.createdAt))` — served by the existing `customers_active_idx`
- **`listCustomerOptions(db)`** — the roster projection, `orderBy(asc(customers.name))`.
- `listCustomers(db)` becomes unused once CP-3 lands; delete it with CP-4.

`customers/services/customers.service.ts`:

- `getCustomersPaged(db, query)` → `GenericQueryResponse<Customer>`.
- `getCustomerOptions(db)` → `CustomerOption[]`.

**Migration.** No column changes. The one index worth adding is a **GIN index on `tags`**
for the `&&` overlap filter — `tags` has no index today. Generate it with
`pnpm db:generate`; never hand-apply DDL, and never apply to the live Neon DB without the
user's say-so. Confirm the migration's `when` beats the newest row in `__drizzle_migrations`
before it can be applied.

---

## 5. The picker inventory (why CP-2/CP-3 come first)

Every consumer below works *today only because the endpoint ignores paging*. Each one is a
silent truncation the moment CP-4 lands.

### Customers

| Consumer | Call today | After CP-4, unmigrated |
|---|---|---|
| `customers-list` (+ leads, blacklist) | `{ page, limit: 10, filters }` | **fixed** |
| `contracts/pages/contract-form` | `{ page, limit, search }`, incremental | **fixed** — already correct, and its `search` starts filtering |
| `contracts-list` filter | `LoadCustomers({ page: 1, limit: 100 })` | truncates at 100 |
| `quotations-list` filter | same | truncates at 100 |
| `quotations/pages/quotation-builder` | same | truncates at 100 |
| `equipment-list` filter | same | truncates at 100 |
| `equipment/components/equipment-form-dialog` | same | truncates at 100 |
| `service-orders/pages/service-order-builder` | `list({})` → `r.items` | **truncates to 10** |
| `quotations/components/send-quotation-dialog` | `get(id)` only | unaffected |
| **field app** `frontend/src/http/customers.service.ts:14` | `GET /customers` → `{ customers }` | **breaks** — shape and completeness |

`service-order-builder.ts:96` even carries the comment *"The customer roster is NOT
catalog-sized (1000+ rows live), so its select virtual-scrolls"* — it is the loudest case.

### Services

| Consumer | Call today | After CP-5, unmigrated |
|---|---|---|
| `service-catalog/pages/services-list` | `LoadServices(query)` | becomes paged |
| `quotations/pages/quotation-builder` | `LoadServices({})` | truncates |
| `service-catalog/pages/service-import` | `LoadServices({})` | truncates |
| `service-orders/pages/service-order-builder` | `list({})` → `r.services` | truncates |

**State trap.** `ServicesState.items` is read by both the list page *and* the pickers. If
`LoadServices` becomes paged, the pickers silently get page 1. The state must gain a
**separate roster slice** — `options` fed by a new `LoadServiceOptions` action — rather than
overloading `items`. `CustomersState` needs the same split (`options` / `LoadCustomerOptions`)
for its picker consumers. Precedent: `UsersService.listAssignable()`.

---

## 6. Services catalog → server-side paging

Supersedes 18 §4's no-pagination decision (Decisions §2 above).

**Backend**

- `listServicesQuerySchema` (`services/validators/services.validator.ts:65`) is today
  `z.object({ q: z.string().optional() })` — add `page` / `limit` (max 100, default 10).
- `GET /services` → `GenericQueryResponse<Service>`. Keep `q`, keep the admin-tier `cost`
  suppression and the `IMAGES_CDN_BASE_URL` materialization.
- **`GET /services/all`** (new, before `/:id`) → `ServiceOptionDTO[]` — the full
  active catalog, name-sorted, for the pickers and the import dedupe. **Same cost-tier rule**
  as `GET /services` (18 §2), enforced **on the server**: a technician's response carries no
  `cost` key at all. Never ship a field the caller may not see and hide it client-side
  (owner, 2026-08-25). Projection:
  `{ id, name, price, cost?, uom, taxRate, internalServiceCode?, isReportSource }` — the
  label, the frozen line snapshot the builders compute from, the import dedupe key, and the
  explosion flag. The website copy, the photo and the SAT keys have no picker consumer.
- **`GET /public/services` is untouched** — it is a separate route with its own published
  subset and must not grow paging.

**Superadmin**

- `services-list.html` gains `[lazy]="true"`, `(onLazyLoad)`, `[first]`, `[totalRecords]`
  — matching the other eight lists. `services-list.ts`'s `query()` gains `page`/`limit` and
  its `load` takes the page argument.
- `ServicesState` gains `total` and the `options` slice described in §5.

---

## 7. Superadmin & field-app clean-up

**Superadmin** (`superadmin/src/app/services/http/customers.service.ts`)

- Delete the `toPage()` legacy shim (line ~95–105) and the `'customers' in res` branch — with
  the backend on the target contract there is one shape. `total: items.length` goes with it.
- `data/dtos/customer-legacy.ts`'s `CustomerListResponse` union collapses to
  `GenericQueryResponse<Customer>`; `normalize()` stays (it fills CRM defaults, unrelated
  to paging).
- `CustomersState` gains `total` wired from the response instead of the faked count.

**Field app** (`frontend/`)

- `src/http/customers.service.ts` `list()` → `GET /customers/all`, typed `CustomerOption[]`.
- `src/state/customers/customers.state.ts:40` — `tap(({ customers }) => …)` → `({ items })`.
- `app/customers/pages/customers/customers.html` keeps its client-side paginator
  (`[paginator]="customers().length > 10"`, non-lazy) — correct over a complete roster.
- Offline/Dexie behaviour is unchanged: the roster is still one request, still complete.

---

## 8. Tests

**Backend (Vitest — hits the live Neon DB, run deliberately)**

- `test/customers.test.ts`: page 1 vs page 2 return **disjoint** rows; `total` is the
  filtered count, not the page length; `limit` capped at 100; each of `search`, `status`,
  `source`, `tags` narrows the set; soft-deleted rows never appear; `GET /customers/all`
  returns the full roster unpaged.
- `test/services.test.ts`: the same paging assertions plus `GET /services/all` completeness
  and the office/technician `cost` suppression on both routes.
- Fixtures follow the existing convention (`test+`-prefixed, soft-deleted in `afterAll`).

**E2E (Playwright, `superadmin/e2e/`)**

- A spec per lazy list page that stubs the API with page-distinct rows and asserts that
  clicking page 2 (a) issues `?page=2`, and (b) **renders page-2 rows** — the assertion that
  would have caught this bug. Stub the API host (`http://127.0.0.1:8788/...`), not a bare
  `/customers` regex, or the route intercepts the document navigation itself.
- Reuse the `e2e/support/superadmin.ts` `signIn` + `page.route` pattern.

---

## 9. Ongoing — the wrapper backlog (opened 2026-08-27, owner)

**Not a checkpoint.** This is a standing task worked **one slice per PR**, never as a
big-bang sweep: each slice moves one module's wire shape, deletes the client-side shim that
existed to absorb it, and ticks its line here. A slice may ride along in an unrelated PR
touching the same module — it may not be batched into a "migrate everything" PR.

**Where the envelope already stands (2026-08-27, verified):** every paged list read in
superadmin is on the generic — customers, users, equipment, reports, report-templates,
contracts, quotations, service-orders (+ its timeline), customer interactions, and services
(CP-5) — plus `NotificationQueryResponse`, the sanctioned derived interface (§2). **There is
no paged read left in superadmin answering a hand-written shape.** What follows is the
*other* half of §2's promise: the single-object and half-envelope wrappers that never carried
paging at all.

**What must stay a bare array, and is not backlog:** rosters (`/customers/all`,
`/services/all`, `listAssignable`, `reportOptions`, `getFonts`), by-parent reads
(`byCustomer`, `listForCustomer`, `listForServiceOrder`), and the catalog/quotation
timelines. A roster has no page and a `total` could only restate the array's own length —
giving one an envelope is the exact mistake §2 exists to prevent (backend `CLAUDE.md`).

| # | Wire shape today | Should be | Blast radius |
|---|---|---|---|
| 1 | `GET/POST/PATCH /customers/:id` + `/status` → `{ customer }` (4 routes) | the row itself | Backend 4 sites + the `unwrap()` shim in superadmin `customers.service.ts` (5 call sites) — the shim is the tell |
| 2 | `GET/POST/PATCH /service-orders/:id`, `/status` → `{ order }` (4 routes) | the row itself | Backend 4 sites + 4 `Observable<{ order: … }>` signatures and their `.order` reads |
| 3 | `GET /service-orders/:id/reports` → `{ reports: [...] }` | a bare array (a by-parent read) | Backend 1 site + 1 client signature |
| 4 | `POST /notifications/:id/read` → `{ notification }` | the row itself | Backend 1 site + 1 client signature |
| 5 | `GET /customers/recent`, `/customers/interactions/recent` → `{ items: [...] }` | a bare array — these are `limit`-bounded card reads, **not** query reads: `items` with no `total`/`page`/`limit` is a half-envelope, the worst of both | Backend 2 sites + `RecentItemsResponse<T>` and its two `map(res => res.items)` shims |
| 6 | `GET /visits` → `VisitDTO[]` | **decide, don't assume** | It is a date-range window read for the calendar, which is legitimately bounded — but it also takes `technicianId`/`internalCode` filters. If 12 ever grows a flat visit *list*, that read pages; the calendar window does not. Settle it in 12, not here |

`GET /public/services` → `{ services: [...] }` is **out of scope**: a published public
contract the website consumes, versioned on its own terms.

---

## Checkpoints

One PR per checkpoint, stacked, in this order. **The order is the safety property** —
CP-4 is only safe once CP-3 has removed every dependency on the unpaged endpoint.

### CP-1 — `GenericQueryResponse<T>` (type-only) — **done 2026-08-25**
- [x] Backend `src/modules/shared/types/generic-query-response.types.ts`; 16 repository/service
      shapes adopt it, repositories included. `PagedContracts` deleted with them — it was the
      one named backend twin.
- [x] `NotificationQueryResponse extends GenericQueryResponse<NotificationView>` in
      `notifications/types/notifications.types.ts`; `listNotifications`, the service and the
      controller all return it instead of assembling the shape by hand
- [x] Superadmin `NotificationListResponse` → `NotificationQueryResponse`, re-derived from
      the generic (one name, one shape, both packages)
- [x] Superadmin `paged-response.ts` → `generic-query-response.ts`, `PagedResponse` →
      `GenericQueryResponse` across the 8 services; quotations' 4 inline `{ items, total }`
      adopt it too (they gain the missing `page`/`limit`)
- [x] Field app `generic-query-response.dto.ts`; `ReportListResponse` and **both** copies of
      `ReportTemplateListResponse` deleted
- [x] No barrels; three builds green
- [x] One wire change, additive: `GET /quotations` and `GET /customers/:id/quotations` now
      echo `page`/`limit`, which they never did. Nothing else on the wire moved — the faked
      `total` on `/customers` is still there and is CP-4's job.

### CP-2 — Roster endpoints (additive, zero behaviour change) — **done 2026-08-25**
- [x] `GET /customers/all` + `listCustomerOptions` + `CustomerOption` projection type
- [x] `GET /services/all` + `listServiceOptions` + `ServiceOptionRow`/`ServiceOptionDTO`;
      cost-tier rule preserved, gated in the service layer so the field never leaves the
      server for a technician
- [x] Both registered **before** their `/:id` routes
- [x] Projection verified against the field-app customers table, its search haystack, the
      report-add picker, the reports list's date formatting and all six superadmin pickers —
      `timezone` and `razonSocial` added as a result (§3)
- [x] Existing routes untouched — nothing in either app changes yet. `GET /customers` still
      returns `{ customers }` unpaged; `GET /services` still returns `{ services }`.

### CP-3 — Migrate every picker onto the roster endpoints — **done 2026-08-25**
- [x] `CustomersState.options` + `LoadCustomerOptions`; `ServicesState.options` + `LoadServiceOptions`,
      backed by `listOptions()` on both http services. `items` is now read only by the two
      list pages that own it.
- [x] Superadmin pickers moved off `LoadCustomers({ page: 1, limit: 100 })` / `list({})`:
      contracts-list, quotations-list, quotation-builder, equipment-list,
      equipment-form-dialog, service-order-builder, service-import
- [x] Field app `customers.service.ts` + `customers.state.ts` → `/customers/all`, bare array;
      the directory keeps its client-side paginator over the complete roster
- [x] `contract-form`'s incremental `p-select` left alone — it is already correct
- [x] After this CP, **nothing depends on `GET /customers` being unpaged** — the only
      remaining `/customers` call in the field app is the create POST

**Decision (owner, 2026-08-25):** the field app gets its own `CustomerOption` DTO
(`data/dtos/customer/customer-option.dto.ts`) mirroring the backend projection, and
`CustomersStateModel.entities` / `ids` / `list` are retyped to it; `selected` stays the full
`CustomerRow` from `GET /customers/:id`. `contactName` and `status` are optional on it so the
full row still satisfies the entity map. The alternative — widening the backend projection so
`CustomerRow` stayed truthful — was rejected: the roster is unpaged, so every column on it is
paid for on every load. `CustomerListResponse` (`{ customers }`) is deleted with the change.

### CP-4 — Paginate + filter `GET /customers` (the bug fix)
- [x] `listCustomersQuerySchema` (page/limit/search/status/source/tags; `tags` split in the schema)
- [x] `listCustomersPaged` + `getCustomersPaged` returning `GenericQueryResponse`; `listCustomers` dropped
- [x] Controller returns the envelope
- [x] GIN index on `tags` declared on the model
- [x] **Migration generated + applied** — `0042_bumpy_greymalkin.sql`, one statement:
      `CREATE INDEX IF NOT EXISTS "customers_tags_gin_idx" ON "customers" USING gin ("tags")`.
      Exactly what this plan predicted a clean regenerate would produce. **It did not ship in a
      21 PR:** it was committed in `0314b18` (#168, the superadmin skeleton fix) — generated in
      that worktree and carried along — which is why this box stayed unticked. Verified applied
      on the live DB 2026-08-27: journal entry 42 is in `__drizzle_migrations` and
      `customers_tags_gin_idx` exists in `pg_indexes`. Nothing left to generate; `pnpm
      db:generate` on current main answers *"No schema changes, nothing to migrate"*.
- [x] Superadmin `toPage()` shim + faked `total` deleted; `CustomerListResponse` union collapsed
- [x] `test/customers.test.ts` paging/filter coverage **written** — not run (live Neon DB)
- [x] Manual check at :4200: clients, leads and blacklist views all page — verified
      2026-08-27 against the **live backend** (no stubs), driving the real UI:

      | view | rows | pages | page 2 |
      |---|---|---|---|
      | clientes (no preset) | 102 | 11 | `?page=2&limit=10` · first row `María Hernández López` → `Patricia Ramírez Torres` |
      | leads (`status=lead`) | 30 | 3 | `?page=2&limit=10&status=lead` · rows change; `status` correctly stays **out** of the URL (preset views don't write it) |
      | blacklist (`status=blacklisted`) | 5 | 1 | single page — nothing to click |

      The API was checked underneath the UI too: page 2 shares no row with page 1, `total`
      stays 102 across pages (never `items.length`), preset filters hold on every page, and
      the envelope is `{ items, limit, page, total }`. The original symptom — *"moving to any
      page never changes the rows"* — is gone.

**Customer selects → lazy virtual scroll (owner, 2026-08-25).** Every customer select now
pages against `GET /customers` through one shared `<app-customer-select>` (CVA, sparse
options array sized from `total`, window→page translation, debounced server-side search).
This **supersedes CP-3's customer half**: `CustomersState.options`, `LoadCustomerOptions` and
`CustomersService.listOptions()` are removed — six selects that read the roster now page
instead. `GET /customers/all` survives for the **field app only**, which stays on the roster
because it captures reports offline. The services roster (`ServicesState.options` /
`LoadServiceOptions`) is untouched. `contract-form` migrated onto the shared component too,
shedding the ~130 inline lines this component was extracted from.

**Migration blocker (2026-08-25) — sync cleared 2026-08-26; migration landed and applied,
confirmed 2026-08-27 (see CP-4's checklist: it rode into main inside #168, not a 21 PR).** `pnpm db:generate` could not
produce a usable migration while this branch trailed `origin/main`:
1. The branch was **5 commits behind `origin/main`**, which already ships
   `0040_wms_data_model.sql` and `0041_wms_node_assignments.sql`. A migration generated there
   was numbered `0040_*` and **collided**.
2. Locally the `meta/` snapshot chain stopped at `0037_snapshot.json` — `0038` and `0039` were
   hand-written and never wrote one. So `generate` diffed against 0037 and re-proposed their
   DDL (`is_report_source`, `discount_amount`, the `service_order_services` alters) alongside
   the GIN index, **without** the `IF NOT EXISTS` guards the hand-written originals carry.
   That migration would have failed on any DB where 0038/0039 already ran.

Both causes were the stale base. The branch was rebased onto `origin/main` (owner, 2026-08-26)
after CP-3 merged, so the `meta/` chain carried main's current snapshot and a regenerate yielded
a clean `0042_*` containing only the GIN index — which is exactly what shipped. **Closed
2026-08-27:** the SQL is on main and applied to the live DB. Generating stayed a separate call
from applying it; the live Neon DB remains the owner's.

### CP-5 — Paginate `GET /services` + lazy services list — **done 2026-08-27**
- [x] `page`/`limit` on `listServicesQuerySchema` (defaults 1/10, `limit` capped at 100);
      `listServices` → `listServicesPaged`, returning `GenericQueryResponse<ServiceRow>`
      with a real filtered count. `q` deliberately keeps its bare `.optional()` shape —
      tightening it to `.min(1)` like `search` would turn a stray `?q=` into a 400
- [x] Controller returns the envelope; `/public/services` untouched, and `GET /services/all`
      stays the unpaged roster
- [x] `services-list` becomes lazy — `[lazy]`, `(onLazyLoad)`, `[first]`, `[totalRecords]`,
      plus `table-paged` so the page turns without the card resizing, and `list.skeletonRows`
      so the skeleton matches the page size. `ServicesState` gains `total`; `refresh()` moves
      to `list.refresh()` so deleting the last row on a page steps back instead of stranding
      you on an empty one
- [x] **CSV export rescued from silent truncation (not in the original checklist).**
      `exportCsv()` serialized "the rows already on screen" — correct while the list held the
      whole catalog, a ten-row file the moment it did not. It now re-reads the whole
      *filtered* catalog via `ServicesCatalogService.listAll()`, which walks pages at the
      server's `limit` cap until it has `total` rows (one request for any ordinary catalog)
      and reports progress on the button. The roster cannot serve it — the export carries
      `description`, `websiteDescription` and the SAT codes, none of which the picker
      projection has. 18 §4's export bullet amended to match
- [x] The e2e services stub answers the envelope **and honours `page`/`limit`/`q`** — a stub
      that always replayed page 1 would let a paging spec pass against the very bug this plan
      exists to remove (CP-6 builds on this)
- [x] `test/services.test.ts` coverage **written** — paging (disjoint pages, `total` as the
      filtered count and never `items.length`, defaults, the 100 cap rejecting 101, `q`
      narrowing, soft-deleted rows leaving both page and count) and the roster (unpaged,
      ignores `page`/`limit`, `cost` suppressed below back-office tier on **both** routes).
      Four existing tests that scanned the unpaged list were filtered down to their fixture —
      "absent from page 1" is not the claim they were making. **Run and green** (owner asked,
      2026-08-27): **48/48** against the live Neon DB in 99s. `afterAll` soft-deleted every
      `test+` fixture (0 left active), the tombstones stay per the no-hard-deletes rule, and
      the 7 real catalog rows were untouched
- [x] `pnpm typecheck` green; superadmin `npm run build` green

### CP-6 — Regression guard
- [ ] Playwright spec per lazy list page: page 2 issues `?page=2` **and renders page-2 rows**
- [ ] Suite green against a running `ng serve`

---

## Notes / risks

- **Silent truncation is the failure mode to fear**, not a crash. A picker that quietly
  shows 100 of 1000+ clients looks fine in review. CP-3 before CP-4 is the mitigation;
  reviewers should treat any surviving `limit: 100` customer fetch as a bug.
- **CP-1 is a wide, shallow diff** (three packages, type-only). Keeping it free of any
  behaviour change is what makes it reviewable — no paging logic, no endpoint edits.
- **18 §4 must be amended** when CP-5 lands — leaving the "no pagination (catalog-sized)"
  line in place would contradict shipped behaviour. Add a dated supersede note there
  pointing at this plan.
- **07's status line** ("done (frontend side — backend customers migration pending)") is
  what this plan closes; update it at CP-4.
- The live Neon DB is shared. Migrations are generated here and applied by a human.
