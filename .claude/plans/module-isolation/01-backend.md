# module-isolation / 01 — Backend: the flag source and its enforcement

> **Status:** planned · **Depends on:** — · **Touches:** `backend/` only
> **Owner:** — · **Last updated:** 2026-08-29

The tenant's `MODULES` variable lives here and nowhere else (00 §4 decision 5). This plan
turns it into a validated set, refuses disabled surfaces with a typed 403, and publishes the
result to the apps.

No migration, no schema change, no `brand`-table involvement: flags are **deployment
identity**, the same category as `apiUrl`, and they are not data the tenant edits.

---

## 1. Where the code lives

A cross-cutting concern gets its own module (`backend/CLAUDE.md` → module layout):

```
src/modules/module-flags/
  enums/module-key.enum.ts             ModuleKey — 16 string-valued members
  constants/core-modules.const.ts      CORE_MODULES — the 5 never-flaggable keys
  constants/module-packages.const.ts   MODULE_PACKAGES — 00 §3.3, declaration-ordered
  constants/module-dependencies.const.ts  MODULE_DEPENDENCIES — 00 §3.4
  services/module-flags.service.ts     parse + validate + memoised resolve
  middleware/module-config.middleware.ts  resolves once per request, 503s on invalid
  middleware/require-module.middleware.ts requireModule(key) -> 403 module_disabled
  controllers/modules.controller.ts    GET /modules
  http-errors/module-disabled.error.ts
  http-errors/module-config-invalid.error.ts
```

`ModuleKey` is a **TS string enum** (`z.nativeEnum`-compatible, compared with `===`), per the
standing backend rule — not a const-array union. `src/env.ts` gains one optional binding:

```ts
export interface Env {
  // …
  /** Allowlist of the optional modules this tenant has, comma-separated.
   *  Accepts package names (`operation-package`) and bare keys, mixed freely.
   *  Absent = every module on. See .claude/plans/module-isolation/00 §3.5. */
  MODULES?: string;
}
```

## 2. Resolution

`env` is only reachable inside the fetch handler on Workers, so resolution cannot happen at
true module scope. Instead the service memoises **keyed on the raw string**, which gives the
same once-per-isolate cost and still re-resolves if the value ever differs:

```ts
// services/module-flags.service.ts  (shape only)
type Resolved =
  | { ok: true; modules: ReadonlySet<ModuleKey>; package: PackageName | null }
  | { ok: false; reason: string };

let memo: { raw: string | undefined; resolved: Resolved } | null = null;

export function resolveModules(raw: string | undefined): Resolved {
  if (memo && memo.raw === raw) return memo.resolved;
  const resolved = compute(raw);
  memo = { raw, resolved };
  return resolved;
}
```

`compute` implements 00 §3.5 exactly, in five steps:

```
validate MODULE_PACKAGES itself  (dependency-closed, expansions distinct)
split on ","  ->  trim, lowercase, drop empties
              ->  whole-value sentinel? ("core" alone, and only alone)
              ->  expand: package token -> its keys | bare key -> itself | else fail
              ->  union with the core keys, then validate dependencies on the union
              ->  derive the package label from the resulting flagged set
```

**The constant is checked before the variable** (owner 2026-08-30): `compute` validates
`MODULE_PACKAGES` — every package dependency-closed, no two expansions equal — before it reads
`MODULES`, and fails the same `module_config_invalid` way if the constant is malformed. That
check fires on *our* bug rather than the operator's value, and it takes every tenant down at
once, so it is a deploy blocker by construction rather than a test somebody can skip.

**Expansion precedes validation** — dependencies are checked on the union, never on the raw
tokens, so a value that names two packages is judged by what it actually produced. Package
expansion cannot itself break a dependency (every package is dependency-closed, 00 §3.3);
only bare-key lists can.

| Input | Result |
|---|---|
| `undefined` | `ok`, every key (core + all 11 flagged); `package: "complete-package"` |
| `"core"` (case-insensitive, trimmed) | `ok`, core only; `package: null` — no package expands to core alone |
| `"wms, billing"` | `ok`, core + `wms` + `billing` (whitespace tolerated, order irrelevant, duplicates collapse); `package: null` |
| `"operation-package"` | `ok`, core + its 10 keys; `package: "operation-package"` |
| `"field-package,contracts"` | `ok`, core + `cms` + `contracts`; `package: null` — the set matches no package's expansion |
| `"operation-package,field-package"` | `ok`, core + the 10; `package: "operation-package"` — `field` adds only `cms`, which `operation` already carries |
| `"cms"` | `ok`, core + `cms`; `package: "field-package"` — the label is derived from the set, not echoed from the input (00 §4 decision 14) |
| `""` or whitespace only | `!ok` — "MODULES is set but empty; use \"core\" for a core-only tenant" |
| any unknown key | `!ok` — names the key and lists the valid ones |
| an unknown `*-package` token | `!ok` — names it and lists the valid **packages**, not the 11 keys |
| a core key, e.g. `"reports"` | `!ok` — "reports is core and cannot be listed" (naming it suggests the author believed it optional) |
| `"core"` with anything else | `!ok` — "core means core-only and cannot be combined; drop it — every value already includes core" |
| unmet dependency | `!ok` — "service-orders requires services" |
| a malformed `MODULE_PACKAGES` constant | `!ok` regardless of the value — a package that is not dependency-closed, or two packages with equal expansions (00 §3.3). Our bug, not the tenant's |

The returned set **always contains the core keys**, so every call site asks the same
question of every module and there is no "is this one core?" branch scattered around.

The derived label is a lookup, not a parse: compare the resolved *flagged* set against each
entry of `MODULE_PACKAGES` in declaration order and return the first exact match, else
`null`. Two packages with identical expansions would make it ambiguous — CP-1 asserts they
are distinct.

## 3. The invalid-config path

One global middleware, first in the chain, resolves and stashes:

```ts
// middleware/module-config.middleware.ts
app.use('*', async (c, next) => {
  const resolved = resolveModules(c.env.MODULES);
  if (!resolved.ok) {
    console.error(`[module-flags] invalid MODULES: ${resolved.reason}`);
    return c.json({ error: 'module_config_invalid', detail: resolved.reason }, 503);
  }
  c.set('modules', resolved.modules);
  await next();
});
```

Mounted **before** `/auth` and everything else, so `POST /auth/login`, `GET /brand` and
`GET /modules` all answer with the same diagnostic body. That is the mitigation for the
fail-loud blast radius (00 §7 risk 1): whatever request the operator happens to try tells
them which key is wrong. `AppBindings['Variables']` gains
`modules: ReadonlySet<ModuleKey>`.

## 4. `requireModule`

```ts
// middleware/require-module.middleware.ts
export const requireModule =
  (module: ModuleKey): MiddlewareHandler<AppBindings> =>
  async (c, next) => {
    if (!c.get('modules').has(module)) {
      return c.json({ error: 'module_disabled', module }, 403);
    }
    await next();
  };
```

Sibling to `requireRole` in `auth/middleware/roles.middleware.ts`, and composed the same
way. **Order:** `requireModule` runs *before* `jwtMiddleware` where both apply — a module the
tenant does not have should answer the same 403 to an expired token as to a valid one, and
there is no reason to verify a JWT for a route that is switched off.

## 5. `GET /modules`

```jsonc
// GET /modules   (jwtMiddleware; any authenticated role)
{
  "package": "operation-package",   // or null — derived, see below
  "modules": ["billing", "branding", "calendar", "cms", "contracts", "crm-metrics",
              "customers", "dashboard", "equipment", "quotations", "reports",
              "service-orders", "services", "templates", "users"]
}
```

Authenticated (00 §4 decision 6), so the list never tells the open internet what a tenant
bought. Sorted for stable diffing, includes the core keys, `Cache-Control: no-store` — a flag
change must reach the next boot, not the next TTL, exactly as `/__config` argues.

`package` is **derived from the resolved set**, not echoed from `MODULES` (00 §4 decision 14):
it names the package whose expansion equals what this tenant has, or `null` when no package
does. Clients must treat `modules` as the only authority and `package` as a label — a tenant
provisioned key-by-key can still report a package name, and a tenant sold a package can report
`null` once a single extra key is added. **Nothing may gate on `package`.**

Not gated by `requireModule` (obviously), and not role-restricted: every signed-in user needs
it to render their own nav.

## 6. Composition-root wiring

`src/index.ts` gains one `app.use` per flagged surface, beside the existing `jwtMiddleware`
lines:

```ts
app.use('*', moduleConfig);                                  // §3, first

app.use('/equipment/*',      requireModule(ModuleKey.Equipment));
app.use('/services/*',       requireModule(ModuleKey.Services));
app.use('/public/services/*',requireModule(ModuleKey.Services));
app.use('/quotations/*',     requireModule(ModuleKey.Quotations));
app.use('/public/quotations/*', requireModule(ModuleKey.Quotations));
app.use('/service-orders/*', requireModule(ModuleKey.ServiceOrders));
app.use('/visits/*',         requireModule(ModuleKey.Calendar));
app.use('/contracts/*',      requireModule(ModuleKey.Contracts));
app.use('/cms/*',            requireModule(ModuleKey.Cms));
app.use('/public/cms/*',     requireModule(ModuleKey.Cms));
```

**The one special case:** `customerQuotations` is mounted at `/customers`
(`app.route('/customers', customerQuotations)`) and serves
`GET /customers/:id{uuid}/quotations`. A prefix `app.use('/customers/*', …)` would take the
core clients directory down with the quotations flag. The gate goes **inside that
controller**, on its single route, next to its existing `requireRole`:

```ts
customerQuotations.get(
  `/:id{${UUID_PARAM}}/quotations`,
  requireModule(ModuleKey.Quotations),
  requireRole(['owner', 'admin', 'office']),
  // …
);
```

Not yet wired, and deliberately so (00 §3.2): `billing` and `wms` have no mounted routes, and
`dashboard` / `crm-metrics` have no server surface at all. Whichever plan mounts billing or
WMS adds its `app.use` line in the same commit as its `app.route`.

## 7. Checkpoints

### CP-1 — vocabulary, resolver, `GET /modules`
- [ ] `enums/module-key.enum.ts` — 16 members, incl. the new `CrmMetrics`
- [ ] `constants/core-modules.const.ts` + `constants/module-dependencies.const.ts` (00 §3.1, §3.4)
- [ ] `constants/module-packages.const.ts` — the three packages of 00 §3.3, declaration-ordered
- [ ] `services/module-flags.service.ts` — `resolveModules` with the §2 memo, the five-step
      pipeline, and the full §2 truth table
- [ ] `middleware/module-config.middleware.ts` + `AppBindings` variable; mounted first in
      `src/index.ts`
- [ ] `controllers/modules.controller.ts` + `app.route('/modules', modules)` behind
      `jwtMiddleware`, returning `{ package, modules }`
- [ ] `MODULES` documented in `backend/wrangler.toml` as a **comment only** — never a value;
      a committed value would make the shared config file the authority again and defeat
      `keep_vars` (25 §7)
- [ ] Unit tests over the bad-input matrix: empty, whitespace, unknown key, unknown
      `*-package` token, core key listed, `core` combined with anything, unmet dependency,
      duplicates, casing, stray whitespace
- [ ] Unit tests over package expansion: each package's exact set, package + bare key,
      two packages, and the derived label for every row of §2
- [ ] `compute` validates `MODULE_PACKAGES` **before** reading `MODULES` — dependency-closed,
      no two expansions equal — and returns `module_config_invalid` when the constant is
      malformed (00 §3.3, owner 2026-08-30). Unit tests cover both violations against a
      deliberately broken fixture constant, and the happy path against the real one
- [ ] `npm run build` green; `wrangler dev` with the var unset behaves exactly as today

### CP-2 — enforcement
- [ ] `middleware/require-module.middleware.ts` + `http-errors/module-disabled.error.ts`
- [ ] The §6 `app.use` block, including both `/public/*` pairs
- [ ] The `customerQuotations` in-controller gate (§6 special case)
- [ ] Verify by hand under `wrangler dev`: `MODULES="core"` → `/services` 403,
      `/customers` 200, `/customers/:id/quotations` 403, `/public/services` 403,
      `/modules` lists core only
- [ ] Verify `MODULES` unset → every route answers as it does today (the regression that
      matters most: every existing tenant is in this state)
- [ ] Confirm 403 precedence over auth: a disabled module 403s with no token, not 401

## 8. Testing note

`backend/test/` runs Vitest against the **live Neon DB** — do not run it casually. The
resolver is pure and needs no database, so CP-1's tests belong in a plain unit spec with no
DB fixture. CP-2's route-level checks are the `wrangler dev` pass above, not new live-DB
suites.
