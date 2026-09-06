# module-isolation / 02 — superadmin: consuming the flags

> **Status:** planned · **Depends on:** 01 CP-1 (`GET /modules`) · **Touches:** `superadmin/` only
> **Owner:** — · **Last updated:** 2026-08-29

The access layer this needs already exists and is the reason the change is small: 14 §3's
central `canMatch` guard, `data: { module, roles }` on every routed module, `navFor`, and a
`hasModule()` that has been a placeholder since 2026-07-15 waiting for exactly this.

**What does not change:** the matrix (`MODULE_ROLES`), route `data`, `accessGuard`'s shape,
`hasRole`, `canManageUser`, `canResetPassword`, or any in-page role gating. This plan fills
in one function and adds the state that feeds it.

---

## 1. `ModulesState`

`src/state/modules/` — `modules.state.ts` + `modules.actions.ts`, mirroring the `MeStatus`
shape `AuthState` already uses so the guard can wait on it the same way:

```ts
export enum ModulesStatus { Idle, Loading, Loaded, Error }

interface ModulesStateModel {
  modules: ModuleKey[];
  package: PackageName | null;
  status: ModulesStatus;
}
```

`package` comes straight from the response (00 §4 decision 14) and is carried for display and
support only — "this tenant is on the operation package" is a useful thing for a screen or a
bug report to say. **Nothing gates on it.** Every gate reads `modules`, because a tenant sold
a package and then given one extra key reports `package: null` while still having everything
the package covers. On the fail-open error path `package` is `null`: the label is the server's
to derive, and we did not get one.

`LoadModules()` calls `GET /modules` through a new
`services/http/modules.service.ts`, whose DTO is `{ package, modules }`. **On error the state resolves to every module enabled**,
not to none — fail-open, the same direction 00 §4 decision 4 chose for an absent variable. A
transient network failure must not strip a tenant's nav; the backend still 403s anything they
genuinely do not have.

**Not persisted.** `withNgxsStoragePlugin({ keys: ['auth.token', 'app'] })` stays as it is,
for the reason its own comment gives: gated UI never renders from stale data. Modules are
refetched every boot exactly like `me`.

## 2. Boot ordering

One line into the existing folded initializer (25 §3 — do **not** add a second
`provideAppInitializer`, they run concurrently):

```ts
await loadRuntimeConfig();
store.dispatch(new LoadBrand());
if (store.selectSnapshot(AuthState.token)) {
  store.dispatch(new LoadMe());
  store.dispatch(new LoadModules());
}
```

`/modules` is authenticated, so it is dispatched under the same token check as `LoadMe()`.
With no token there is nothing to gate — `accessGuard` already returns `true` in that case so
`authGuard` can bounce to `/login`.

After **login** (not just boot), `LoadModules()` must run alongside the existing `me` fetch,
or the first session after a fresh login renders an ungated nav.

## 3. `hasModule`

`app/guards/has-module.guard.ts` loses its `void module; return !!me;` stub. It becomes a
pure predicate over the resolved list, keeping the file's one-guard-per-file shape:

```ts
export const hasModule = (modules: readonly ModuleKey[] | null, module: ModuleKey): boolean =>
  !!modules && modules.includes(module);
```

`canAccess` composes as it already does — `hasModule(...) && hasRole(...)` — so its callers
(route guard, nav filter, in-page `@if`s) need no change beyond passing the list. Prefer
threading the list through `canAccess`'s signature over injecting the store into a pure
helper; the guards folder is deliberately store-free.

## 4. `accessGuard` waits on two statuses

Today it waits for `meStatus` to leave `Loading`. It must now wait for **both**, or a
deep link resolves against an empty module list and bounces the user to the landing route:

```ts
return combineLatest([
  store.select(AuthState.meStatus).pipe(filter(isSettled)),
  store.select(ModulesState.status).pipe(filter(isSettled)),
]).pipe(take(1), map(() => /* canAccess as today */));
```

The authenticated layout's boot splash covers the same two conditions.

## 5. Landing + the `dashboard` flag

`defaultRouteFor` currently sends owner/admin/office to `/dashboard` unconditionally. With
`dashboard` flaggable it becomes flag-aware, per 00 §4 decision 12:

| Role | Landing |
|---|---|
| owner / admin / office | `/dashboard` if the flag is on, else **`/customers`** (core, always present) |
| technician | `/reports` (core) — unchanged |

The file's standing note about flipping technicians to `/calendar` once 12 ships stays a
note, and if it is ever acted on it has to check the `calendar` flag first — a technician on
a tenant without scheduling cannot land on a route that does not match.

## 6. Nav and the `crm-metrics` split

- `NAV` → CRM group → `{ label: 'Dashboard', route: '/customers/dashboard' }` moves from
  `module: 'customers'` to `module: 'crm-metrics'`. Every other CRM child keeps `customers`.
- `customers.routes.ts` → the `dashboard` child gains its own gate. The parent's `canMatch`
  covers core `customers`; the child needs `canMatch: [accessGuard]` and
  `data: { module: 'crm-metrics', roles: [...] }` of its own, or the metrics page stays
  reachable on a tenant without it.
- `MODULE_ROLES` gains a `crm-metrics` row (same set as `customers`:
  `['owner', 'admin', 'office']`).
- `ModuleKey` gains `'crm-metrics'` — 16 keys, matching the backend enum.
- Groups already collapse when every child is filtered out (`navFor`'s documented
  behaviour), so a tenant with no CRM extras loses the rows and keeps the group only if
  something in it survives. Verify with `MODULES="core"`: the CRM group should show Clientes,
  Lista negra and Archivados, and nothing else.

## 7. Embedded cross-module surfaces

The gates that get forgotten are never the routes (00 §7 risk 4). Inventory to walk and gate
with `hasModule` before CP-3 closes — each is a block inside a page owned by a *different*
module:

- Customer detail — equipment tab (`equipment`), quotations panel (`quotations`), service
  orders panel (`service-orders`), contracts panel (`contracts`), CRM metrics widgets
  (`crm-metrics`)
- Report detail / capture — materials block (`wms`)
- Service order detail — visits (`calendar`), quotation origin (`quotations`), generated
  contracts (`contracts`)
- Quotation detail — "create order" action (`service-orders`)
- The `/dashboard` cockpit — every tile that aggregates a flagged module
- The topbar ⌘K palette — when 24 lands (00 §7 risk 5)

Walk each module's pages rather than trusting this list to be complete; it is a starting
point, not an inventory that has been proven exhaustive.

## 8. 403 handling

`module_disabled` needs no special client path: 14 §4 already tells module agents to treat
403 as normal flow (toast + stay), and the toast copy comes from `errorMessage(err, …)`
verbatim per the standing rule — no status-conditioned hardcoded string. The only 403s a
correctly-gated app should ever see are races against a flag change mid-session.

## 9. Checkpoint

### CP-3 — superadmin consumes the flags
- [ ] `ModuleKey` gains `'crm-metrics'`; `MODULE_ROLES` gains its row
- [ ] `state/modules/` — state + actions + `services/http/modules.service.ts`, fail-open on error
- [ ] `LoadModules()` in the folded initializer **and** on the post-login path
- [ ] `has-module.guard.ts` implemented; `canAccess` threads the list
- [ ] `accessGuard` + the layout splash wait on both statuses
- [ ] `defaultRouteFor` flag-aware (§5)
- [ ] `NAV` Dashboard → `crm-metrics`; `customers.routes.ts` dashboard child gated
- [ ] §7 embedded surfaces walked and gated
- [ ] Manual pass against a `wrangler dev` backend with `MODULES="core"`, then
      `MODULES="core"` + one flag at a time: nav, deep links, landing, and no console errors
      from a page whose module is off
- [ ] `npm run build` green
