# module-isolation / 00 — Suite overview

> **Status:** planned (doc) · **Depends on:** superadmin 25 (Worker-per-tenant deploy model),
> superadmin 14 (access matrix)
> **Touches:** `backend/`, `superadmin/`, `frontend/` · **Owner:** — · **Last updated:** 2026-08-29

`14-access-control.md` has carried the same hole since its 2026-07-15 correction:

> the **module segregation mechanism** — how an organization's flags reach a tenant
> instance — is deliberately open, to be discussed later; do not build any in-repo flag
> plumbing until it's decided.

This suite is that decision, settled with the owner on **2026-08-29** (§4). It replaces
`hasModule()`'s `return !!me` stub with a real gate, and — unlike the 2026-07-14 shape that
was stripped — the gate is **enforced by the backend**, not merely rendered by the clients.

The mechanism is one **allowlist environment variable on each tenant's backend Worker**,
published to the apps over a small authenticated endpoint. It rides the deploy topology
plan 25 already built: one Worker per tenant, per-tenant values in that Worker's dashboard,
`keep_vars: true`, **one build for every tenant**.

---

## 1. Sub-plans

| # | File | Scope |
|---|---|---|
| 00 | `00-overview.md` | This file — mechanism, vocabulary, decisions ledger, board, risks, asks |
| 01 | `01-backend.md` | `MODULES` var, resolver + validation, `requireModule` middleware, `GET /modules` |
| 02 | `02-superadmin.md` | `ModulesState`, `hasModule` on real flags, landing fallback, nav, the `crm-metrics` split |
| 03 | `03-field-app.md` | The field app's first module layer (it has none today) + offline flag cache |
| 04 | `04-provisioning.md` | Per-tenant provisioning checklist, docs sweep, the manager-push contract (open) |

**Build order is numeric.** 01 fixes the contract; 02 and 03 consume it and may run in
parallel once `GET /modules` exists; 04 closes the suite. One PR per checkpoint, stacked,
base `main` — branch `feature/backend-module-isolation`,
`feature/superadmin-module-isolation`, `feature/frontend-module-isolation`,
`docs/fullstack-module-isolation-provisioning`.

## 2. The mechanism, end to end

```
  Cloudflare dashboard (tenant's backend Worker)
      MODULES = "field-package,calendar"        <- the only place flags exist
            |
  backend/  |  per request, memoised on the raw string:
            |     parse -> expand packages -> union -> validate -> Set<ModuleKey>
            |     invalid  -> every route 503 module_config_invalid (§7 risk 1)
            |     valid    -> requireModule() on each flagged route group
            |                 GET /modules (authed) -> { package, modules }
            v
  superadmin/  boot: /__config -> /brand -> (token?) /auth/me + /modules
  frontend/    boot: /__config -> /brand -> (token?) /users/me + /modules
            |
            +-> hasModule() -> canMatch guard (chunk never requested)
            +-> nav filter  -> entry never rendered
            +-> in-page @if -> embedded cross-module blocks hidden
```

Three properties fall out of that shape and are the point of the whole suite:

1. **One place per tenant.** The flag list exists only on the backend Worker. The app
   Workers keep `API_URL` and nothing else — `/__config` stays `apiUrl`-only. There is no
   second copy to drift.
2. **One build.** A flag change is a dashboard edit plus a reload, never a rebuild. Disabled
   lazy chunks are still emitted and served; they are simply never requested.
3. **The backend is authority, the clients are hygiene.** A disabled module's endpoints
   answer `403 module_disabled` to a perfectly valid token. Client-side gating exists so
   nobody is shown a door that 403s — exactly the division 14 §2 already states for roles.

## 3. Module vocabulary

### 3.1 Core — never flaggable (5)

`users` · `reports` · `templates` · `customers` · `branding`

These have no flag, no `requireModule`, and no way to switch off. Rationale, owner
2026-08-29: reports is the standalone-sellable pillar (memory: the reporting suite sells on
its own), report **templates** are the machinery reports capture through rather than a
separate product, `customers` is the directory every other module points at, `users` and
`branding` are the shell. **`customers` core covers the directory, detail, timeline,
blacklist and archived — not `/customers/dashboard`** (§3.2).

### 3.2 Flagged (11)

| Key | Surface | Backend route groups gated |
|---|---|---|
| `dashboard` | The `/dashboard` cockpit | *none today — client-only flag* |
| `crm-metrics` | `/customers/dashboard` (`CrmDashboard`) | *none today — client-only flag* |
| `equipment` | Equipment registry (11) | `/equipment` |
| `services` | Service catalog (18) | `/services`, `/public/services` |
| `quotations` | Quotations (20) | `/quotations`, `/public/quotations`, `GET /customers/:id/quotations` |
| `service-orders` | Service orders (19) | `/service-orders` |
| `calendar` | Visits + team calendar (12) | `/visits` |
| `contracts` | Contracts (13) | `/contracts` |
| `billing` | Billing (09) | *module not built — reserve the key* |
| `cms` | CMS content (04) | `/cms`, `/public/cms` |
| `wms` | Warehouse (10) | *not mounted in `index.ts` yet — reserve the key* |

`crm-metrics` is a **new key**, added because the owner put `customers` in core while
carving its metrics page out. `ModuleKey` therefore goes from 15 entries to 16.

Three honest gaps to keep visible:

- **`dashboard` and `crm-metrics` gate nothing server-side.** Both cockpits compose from
  other modules' endpoints; there is no aggregate endpoint to protect. They are the two
  flags whose enforcement really is client-only, and saying so beats implying otherwise.
- **`billing` and `wms` have no mounted backend surface** (`index.ts` routes neither). Their
  keys are reserved now so the modules are born gated; 01 CP-2 adds the `app.use(...)` line
  as part of whichever plan mounts them.
- **`/public/*` gating reaches `website/`.** Turning off `services` or `cms` takes the
  public catalog and published content offline for the marketing site too. That is the
  correct behaviour — a module the tenant does not have should not serve its public face —
  but it is a consequence worth stating before someone meets it in production.

### 3.3 Packages (sales sugar over the same keys)

A **package** is a name that expands to a set of keys. Nothing more: the resolver expands
every package token, unions the result with any bare keys in the value, and validates the
union. Packages are therefore **freely mixable** — with each other and with individual keys —
and per-module granularity survives untouched, which is why §4 decision 3 stands as written
rather than being superseded.

| Package | Flagged keys it adds | Count |
|---|---|---|
| `field-package` | `cms` | 1 |
| `operation-package` | everything but `wms` — `dashboard`, `crm-metrics`, `equipment`, `services`, `quotations`, `service-orders`, `calendar`, `contracts`, `billing`, `cms` | 10 |
| `complete-package` | all 11, `wms` included | 11 |

Every package carries the core five as well, like every other value.

**`field-package` really is core + `cms`.** Its sold contents — clients, reports, templates,
users — are all core (§3.1), so `cms` is the only flagged key it contributes; confirmed by the
owner after the overlap was flagged. No `dashboard`, no `crm-metrics`, no `equipment`, no
`calendar`. The package earns its name by being sayable at provisioning time, not by carrying
keys the tenant would not otherwise have.

**`complete-package` resolves identically to leaving `MODULES` unset.** It exists so a
complete tenant is stated deliberately rather than by omission — the operator who writes it
and the operator who forgets the variable land in the same place, but only one of them meant
to.

**`operation-package` excludes `wms` everywhere**, the field app included: such a tenant has
no warehouse in superadmin *and* no material-consumption surfaces in the technician PWA
(03 §1).

Two authoring rules for anyone adding a package later, and **the resolver enforces both at
boot** (owner, 2026-08-30): before it looks at `MODULES` at all, `compute` validates
`MODULE_PACKAGES` itself and answers `503 module_config_invalid` if the constant is malformed.
A bad package definition therefore cannot ship quietly — it fails the same loud way a bad
tenant value does, and it fails for every tenant at once, which is the point.

- **A package must be dependency-closed** (§3.4). All three defined here are — `operation` and
  `complete` carry `services` alongside `quotations` and `service-orders`, and `field` has no
  flagged dependencies at all — so package expansion can never *by itself* produce an unmet
  dependency in a tenant's value. Only bare-key lists can.
- **No two packages may expand to the same set**, or the derived `package` label (§4
  decision 14) becomes ambiguous. Matching runs in declaration order.

### 3.4 Dependency graph

Validated at boot, **fail-loud** (§4 decision 8): an incoherent list is a provisioning
error, never something the resolver quietly widens. Validation runs on the **union after
package expansion**, never on the raw tokens.

| Module | Requires | Why |
|---|---|---|
| `quotations` | `services` | Quotes are catalog-fed; there is nothing to quote from without a catalog (20) |
| `service-orders` | `services` | Orders are catalog lines exploded into reports (19) |

Everything else is independent, or depends only on core (`billing` → `reports` for
bill-by-report, `wms` → `reports` for report materials, `equipment` → `customers`,
`crm-metrics` → `customers`) and is therefore always satisfiable. `dashboard` renders tiles
for whatever is enabled and has no requirement of its own.

Two edges are **not** in the table on purpose and need an owner ruling (§8):
`service-orders` → `quotations`, and `contracts` → `service-orders`.

### 3.5 Variable grammar

```
MODULES absent                            -> every module on   (fail-open; matches API_URL's degrade-don't-break precedent)
MODULES="core"                            -> core only
MODULES="wms,billing"                     -> core + wms + billing
MODULES="operation-package"               -> core + the 10 keys of §3.3
MODULES="field-package,contracts"         -> core + cms + contracts        (package + a bare key)
MODULES="operation-package,field-package" -> core + the 10                 (field adds only cms, already there)
MODULES=""                                -> INVALID -> 503   (see below)
MODULES="wmss"                            -> INVALID -> 503   (unknown key)
MODULES="field-pack"                      -> INVALID -> 503   (unknown package)
MODULES="core,field-package"              -> INVALID -> 503   (core cannot be combined)
MODULES="service-orders"                  -> INVALID -> 503   (unmet dependency: services)
```

The empty string is deliberately **not** a synonym for `core`. "I meant core-only" and "I
fat-fingered the value" are indistinguishable otherwise, and silently shipping every module
to a tenant who was trying to restrict them is the worse of the two failures. `core` is the
explicit way to say it.

**`core` stays a whole-value sentinel, not a token.** `"core,field-package"` reads as "core
only, plus CMS" — self-contradictory on its face — so it 503s, and the fix is to drop it:
every value already includes the core five. The same fail-loud reasoning rejects an individual
core key like `"reports"`; the only difference is that `core` is a legal *value* while
`reports` is not a legal token anywhere.

An unknown `*-package` token takes the same path as an unknown key, with a message that reads
the suffix and lists the valid **packages** rather than the 11 keys — a provisioner who typed
`field-pack` wants the package names back, not the vocabulary they were trying to avoid.

## 4. Decisions (2026-08-29, owner)

1. **Depth — apps *and* backend.** The Angular apps hide and block disabled modules; the
   backend rejects their endpoints. A disabled module is genuinely absent, not merely
   unlinked. Supersedes 14's "there is no module gating against signed-in tenant users".
2. **Runtime, one build.** Flags flip at boot from an env var. No per-tenant build, no
   build-time route pruning — that would reverse plan 25's entire payoff.
3. **Granularity — one flag per `ModuleKey`, over a fixed core.** Not 14 §1's bundled packs
   (`billing/wms/crm/cms/scheduling`); `scheduling` does **not** bundle calendar with
   contracts, and equipment does **not** ride core clients — both are their own flags.
4. **Allowlist, absent = all on.** One `MODULES` var naming what the tenant has. An
   existing deploy and a forgotten variable both keep behaving exactly as today.
5. **Source of truth — the backend Worker var only.** Not one var per Worker (drift), not a
   manager-pushed DB row (a schema + push contract where a variable will do). The app
   Workers gain nothing new; `/__config` keeps carrying only `apiUrl`.
6. **Carrier — a new `GET /modules`, authenticated.** Not `/brand` (world-readable would
   publish which modules each tenant bought), not the two `me` endpoints (superadmin reads
   `/auth/me`, the field app reads `/users/me` — two payloads to keep identical forever).
   Gating decisions only exist for signed-in users, so an authed carrier costs nothing:
   `accessGuard` already returns `true` when there is no token.
7. **Core set (§3.1)** — `users`, `reports`, `templates`, `customers`, `branding`; the app
   cockpit and the CRM metrics page each get their own flag (`dashboard`, `crm-metrics`).
8. **Inconsistent flag lists fail loud**, they are not auto-corrected (§3.4).
9. **Refusal shape — routes stay mounted; middleware answers `403 module_disabled`.** Not
   an unmounted-route 404: a typed, logged 403 tells support and the client the difference
   between "not sold" and "broken", and the apps already treat 403 as normal flow (14 §4).
10. **Field app gets a generic layer**, mirroring superadmin's `guards/` folder, rather than
    two one-off gates on visits and materials. The next module that reaches the PWA should
    be a one-line addition, not a second retrofit.
11. **Provisioning is manual for now** — `MODULES` set in the tenant Worker's dashboard next
    to `API_URL`, per plan 25 §7. The whitelabel manager's push path is specified as an open
    contract in `04-provisioning.md`, not built here.
12. **Landing fallback is `/customers`** when `dashboard` is off — core, always present, and
    where staff without a cockpit actually start.

Packages joined the value grammar later the same day, after the suite above was first
written. They change the vocabulary, not the mechanism:

13. **Packages are sugar, freely mixable.** A package name expands to keys and the value is
    the union of every token's expansion, so two packages together, a package plus bare keys,
    and a plain key list are all valid. Per-module granularity survives, which is why
    **decision 3 stands as written**: packages are a way to *say* a common set, not a
    replacement for saying it key by key.
14. **`GET /modules` returns `{ package, modules }`, and `package` is derived from the
    result**, not echoed from the input — whichever package's expansion exactly equals the
    resolved flagged set, else `null`. Three consequences worth knowing before anyone displays
    it: an unset `MODULES` reports `"complete-package"` (identical expansion), `MODULES="cms"`
    reports `"field-package"` (that *is* its set), and `MODULES="core"` reports `null` (no
    package expands to core only). It is a label for what the tenant has, not a record of how
    it was written.
15. **`core` remains a whole-value sentinel** and cannot be combined with anything (§3.5).

Confirmed 2026-08-30, after four rules in this suite were found to have been written without
being put to the owner first. Three stood; one changed:

16. **Dependency validation runs on the union, after package expansion** — never on the raw
    tokens, so a value naming two packages is judged by what it produced (§3.4).
17. **An unknown `*-package` token gets a suffix-aware 503** naming the valid packages rather
    than the 11 keys (§3.5).
18. **Both package authoring rules are enforced at boot, not merely unit-tested** — `compute`
    validates `MODULE_PACKAGES` before it reads `MODULES` and 503s on a malformed constant
    (§3.3). *This one changed the plan as written.*
19. **`package` is display-only.** Every gate reads `modules`; the clients' fail-open path
    reports `package: null` (02 §1).

## 5. Binding invariants

- **The backend is the sole authority.** Client gating is UX and bundle hygiene. Never gate
  a restricted surface only in the UI (memory: gate restricted fields on the server).
- **The access matrix is unchanged.** `MODULE_ROLES`, route `data`, `accessGuard`,
  `hasRole`, and in-page `@if`s all keep working as 14 describes. This suite fills in
  `hasModule` and adds a server-side twin; it relitigates nothing about roles.
- **Module × role compose, they do not merge.** `canAccess = hasModule && hasRole`, exactly
  as `can-access.guard.ts` already writes it.
- **A flag change takes effect on the next boot**, not mid-session. A live session that hits
  a newly-disabled module gets a 403 and treats it as normal flow.
- **No new build-time knobs.** `production` and `bypassAuthGuard` stay compile-time; module
  flags are deployment identity, like `apiUrl` (25 §2).
- **Guards stay one-per-file** in `app/guards/`, enums are TS enums backend-side, no barrel
  files — the standing repo rules apply to every file this suite adds.

## 6. Checkpoint board

Legend: ☐ not started · ◐ in progress · ☑ done

| CP | Plan | Scope | State | PR |
|---|---|---|---|---|
| CP-1 | 01 | Backend: `ModuleKey` enum, `MODULES` resolver + validator, `GET /modules` | ☐ | — |
| CP-2 | 01 | Backend: `requireModule` wired at the composition root (incl. `/public/*`) | ☐ | — |
| CP-3 | 02 | superadmin: `ModulesState`, real `hasModule`, landing fallback, `crm-metrics` | ☐ | — |
| CP-4 | 03 | field app: module vocabulary + guards + nav filter + offline cache | ☐ | — |
| CP-5 | 04 | Provisioning checklist + docs sweep (14 correction superseded) | ☐ | — |

## 7. Risks

1. **Fail-loud's blast radius.** A typo in `MODULES` takes the tenant's whole API to 503 —
   by design (decision 8), but it means a one-character provisioning slip is a full outage,
   not a degraded app. Mitigations, all in 01 CP-1: the 503 body names the offending key and
   the reason, **every** route including `/auth/login` and `/modules` returns that same
   diagnostic body (so the operator reads the cause from any request they try), and the
   resolver is unit-tested against the whole bad-input matrix. Accepted deliberately: the
   alternative is a tenant silently running with modules they did not buy.
2. **Resolution is memoised per isolate.** `env` is only reachable inside the fetch handler
   on Workers, so the set is resolved on request and cached keyed on the raw string
   (01 §2) — cheap, and it re-resolves if the value ever differs. A dashboard edit still
   reaches users only on their next page load, because the clients read the list at boot:
   `MODULES` is a provisioning control, not a live kill switch.
3. **The field app boots offline routinely.** Flags must be cached to `localStorage` on
   every successful fetch and read back on a cold offline boot, the same shape
   `runtime-config.ts` already uses for `apiUrl` — otherwise a rooftop reload either hides
   modules the tenant has or shows modules it does not.
4. **Cross-module embedded surfaces.** The gates that get forgotten are never the routes —
   they are the equipment tab inside a customer, the materials block inside a report, the
   quotations panel on a customer detail. 02/03 carry an explicit inventory of these; the
   rule is that every embedded consumer checks `hasModule` for the module it embeds.
5. **`GET /search` (plan 24) does not exist yet.** When it lands it must intersect its
   per-module scope with the enabled set, or a disabled module's records leak through
   search. Recorded here so 24 inherits it rather than discovers it.

## 8. Open items / asks

- **`service-orders` → `quotations`?** Master plan 00 lists 19 as depending on 20, but an
  order can be raised standalone. Hard edge or not?
- **`contracts` → `service-orders`?** 13 was reworked 2026-07-24 so contracts are artifacts
  generated from orders, yet "standalone contracts need only 07". Hard edge or not?
- **`wms` → `calendar`?** Only the inventory *reservation* slice (10-wms §6 #10) needs the
  visit entity. Suggested: not a hard edge; the reservation slice checks `calendar` in-page.
- **`crm-metrics` as a key name** — taken from the question that settled the split. Rename
  freely before CP-1 lands; it is the one name in §3.2 with no precedent behind it.
- **All 503 `detail` copy is drafted, not approved.** Every message quoted in §3.5 and 01 §2
  is drafted wording rather than an owner call — including whether a malformed
  `MODULE_PACKAGES` (§3.3) should say plainly that it is a product bug rather than a bad
  variable, since that check fires on our mistake and not the operator's. Review as a set
  before CP-1 lands.
- **Empty-string handling** (§3.5) is a derived rule, not an owner decision — confirm that
  `MODULES=""` should 503 rather than mean `core`.
- **Manager push path** — `04-provisioning.md` §3 sketches two shapes (Cloudflare API PATCH
  vs a shared-token backend endpoint). Neither is chosen; both are out of this suite's scope.
