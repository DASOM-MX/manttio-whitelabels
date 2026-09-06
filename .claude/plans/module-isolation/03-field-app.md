# module-isolation / 03 — Field app: its first module layer

> **Status:** planned · **Depends on:** 01 CP-1 (`GET /modules`); reads 02 for the shape
> **Touches:** `frontend/` only · **Owner:** — · **Last updated:** 2026-08-29

The field app has **no module vocabulary at all** today: no `ModuleKey`, no `accessGuard`, no
route `data` — just `authGuard` plus an `adminGuard` that compares
`AuthState.role === 'admin'`. This plan gives it the same small access layer superadmin has
(00 §4 decision 10), so the next module that reaches the PWA is a route-`data` line rather
than a second retrofit.

Two things make this leg different from 02, and both come from the app being an offline-first
PWA: the flag list must survive a cold offline boot, and the offline queue can hold work for a
module that has since been switched off.

---

## 1. Scope today

With the core set as 00 §3.1 defines it, most of this app is core and cannot be gated:

| Surface | Module | Gated? |
|---|---|---|
| `/home`, `/reports`, `/reports/:id`, `/report/pending/:id`, `/report-add` | `reports` + `templates` | core — never |
| `/customers`, `/customer-add`, `/customers/:id/edit` | `customers` | core — never |
| `/users`, `/users/add`, `/users/:id/edit` | `users` | core — never |
| `/visits`, `/visits/:id` | `calendar` | **yes** |
| Report materials capture (10-wms/09, not built) | `wms` | **yes, when it lands** |

**`operation-package` tenants have no WMS here either** (owner, 2026-08-29). The package
excludes `wms` across the whole product, not just superadmin: no warehouse in the admin *and*
no material-consumption surfaces in the technician PWA. When 10-wms/09 builds those surfaces
they arrive behind this flag, so an operation-package tenant never sees them — the field app
must not treat materials capture as unconditionally present just because reports are core.

So `calendar` is the one flag that changes this app's UI today. The layer is still built
generically — declaring `data: { module: 'reports' }` on a core route costs nothing and means
the WMS technician surfaces arrive gated instead of arriving and then being retrofitted.

## 2. The layer

Mirrors `superadmin/src/app/guards/`, one guard per file, `.guard.ts` suffix for every new
file (the existing `auth-guard.ts` / `admin-guard.ts` names are left alone — renaming them is
not this plan's business):

```
src/app/data/types/access/module-key.type.ts   ModuleKey — same 16 keys as the backend enum
src/app/guards/has-module.guard.ts             pure predicate
src/app/guards/access.guard.ts                 canMatch: module gate only
src/state/modules/modules.state.ts + .actions.ts   model mirrors 02 §1, `package` included
src/http/modules.service.ts                    GET /modules -> { package, modules }
```

`access.guard.ts` here is **module-only**. It does not fold in roles: this app's role model is
`adminGuard`'s single admin/technician split, not superadmin's four-role matrix, and merging
the two would be inventing a second access system rather than reusing one. Routes keep
`canActivate: [adminGuard]` where they have it and gain `canMatch: [accessGuard]` +
`data: { module }`.

## 3. Offline behaviour — the part that is not a copy of 02

**Persisted, unlike superadmin.** Add `'modules'` to
`withNgxsStoragePlugin({ keys: ['auth', 'reportDraft', 'app', 'brand'] })`. Superadmin
deliberately refetches gating data every boot so nothing renders from stale state; this app
boots on a rooftop with no signal, where "stale" is the only option there is. Same reasoning
that already persists `brand` here and not there.

**Status seeding.** If a persisted list exists, `ModulesState.status` starts as `Loaded` and
the guard never blocks; the network fetch refreshes it in the background. A first-ever boot
with no cache and no network falls open to every module, matching 00 §4 decision 4.

**Boot ordering.** `LoadModules()` joins the existing folded initializer under the same token
check as the other authenticated loads, after `loadRuntimeConfig()` — it must not be a second
`provideAppInitializer` (25 §3).

## 4. The offline queue and a disabled module

A visit action can be queued offline and the `calendar` flag can be off by the time the queue
flushes — a race the admin app cannot have. Left alone, `OfflineSyncService` would retry a
permanently-403ing action forever and block everything behind it.

Rules for CP-4:

- **Do not enqueue** work for a module that is disabled at the time of the action. With the
  route gated this should be unreachable; treat it as the second line of defence.
- **On `403 module_disabled` during a flush, park the item rather than retry** — mark it
  failed-permanent, surface it in the existing pending/sync dialog with a plain explanation,
  and move on to the next item. It is never silently dropped: the technician's captured work
  is not ours to discard (no-hard-deletes reasoning, applied to the queue).
- **Do not skip the queue wholesale** when a flag is off. Reports are core and must always
  flush; only the disabled module's items park.

## 5. Nav

`shared/bottom-nav.ts` gains the module predicate beside its existing `isAdmin()` computed —
a `computed()` per gated entry, never a method call in the template (standing rule). A
technician on a tenant without `calendar` sees a bottom nav with no Visitas entry, and typing
`/visits` does not match.

## 6. Checkpoint

### CP-4 — the field app's module layer
- [ ] `data/types/access/module-key.type.ts` — 16 keys, identical to the backend enum
- [ ] `state/modules/` + `http/modules.service.ts` (`{ package, modules }`), fail-open on error
- [ ] `'modules'` added to the storage-plugin keys; status seeded from cache (§3)
- [ ] `LoadModules()` in the folded initializer, under the token check
- [ ] `has-module.guard.ts` + `access.guard.ts` (module-only, §2)
- [ ] Every route in `app.routes.ts` declares `data: { module }`; `/visits` and `/visits/:id`
      gain `canMatch: [accessGuard]`
- [ ] `bottom-nav` filters gated entries via computed signals
- [ ] Offline queue: park-on-`module_disabled` (§4) + a line in the sync dialog for parked items
- [ ] Offline-boot test against a real build: install, disable `calendar` on the backend,
      reload online (entry disappears), then go offline and reload (entry still gone, reports
      still work)
- [ ] Service-worker cycle unaffected — this adds no new index/asset naming (25 §5 risk 1)
- [ ] `npm run build` green
