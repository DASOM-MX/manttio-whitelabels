# 25 — Runtime config (SSR shell on Workers, `apiUrl` from CF vars)

> **Status:** in progress — **CP-1 done 2026-08-28**; CP-2…CP-7 pending
> **Depends on:** 02 (app shell) · **Touches:** `superadmin/`, `frontend/` (no `backend/` change)
> **Owner:** — · **Last updated:** 2026-08-28

`apiUrl` is compiled into both Angular bundles today (`environment.ts`, one literal per
app). Every whitelabel tenant that points at a different API host therefore needs its own
**build**, and changing the host means a redeploy rather than a settings change. This plan
moves `apiUrl` to a value the app reads **at boot from the edge**, sourced from Cloudflare
environment variables.

The mechanism is an SSR-capable Worker serving each app, with **every route set to
`RenderMode.Client`**. No route is server-rendered today: the Worker exists to own the
request path and expose a tiny `/__config` endpoint. Because nothing renders server-side,
none of the ~15 lazy feature areas, PrimeNG, NGXS-storage or Dexie need SSR-safety work —
that is the entire reason for the all-CSR setting, and it is what keeps this plan small.

---

## Decisions (2026-08-28)

Answers to the scope forks raised before this plan was written:

1. **Deploy target → migrate both apps to Workers Static Assets.** `wrangler.jsonc` with
   `main` = the Angular server bundle and `assets` = the browser build. This is the
   documented Angular SSR path, and matches `backend/` (already a Worker). Staying on
   Pages would require bundling the server output into `browser/_worker.js` as a
   post-build step, and would drag `_routes.json` back in. Cost accepted: new CF
   projects + a domain cutover per app.
2. **Injection → `GET /__config` fetched at boot,** not HTML injection. The shell stays
   byte-identical and fully edge-cacheable; the price is one blocking round-trip before
   bootstrap. See §3 for the initializer-ordering trap this creates.
3. **Scope → both Angular apps in one suite.** `superadmin/` proves the pattern
   (CP-1…CP-4), `frontend/` follows (CP-5…CP-7). The field app is a PWA with
   `@angular/service-worker` and an offline-first Dexie queue, so it carries two extra
   problems the admin does not: the service-worker index filename changes, and boot must
   survive having no network at all. `website/` (Astro) is untouched.

### Note on cost, recorded so it stays visible

With decision 2, **SSR earns nothing today** — a plain assets Worker with a `/__config`
route would deliver identical behaviour with roughly a third of the configuration. The
`@angular/ssr` toolchain is being installed as *scaffolding*, so individual routes can be
flipped to `RenderMode.Server` later without re-doing the deploy topology. That is a
deliberate owner call ("csr on all routes **for now**"). If server rendering turns out
never to be wanted, CP-2 and CP-6 can be reverted and the Worker kept.

---

## 1. Target topology

Per app, one Worker, assets-first routing:

```
dist/<app>/
  browser/    -> assets binding (ASSETS): hashed JS/CSS, media, icons
  server/     -> bundled into the Worker
```

Cloudflare serves a matching static asset **first**, and invokes the Worker only when no
asset matches. That yields exactly the behaviour needed:

| Request | Served by |
|---|---|
| `/main-<hash>.js`, `/styles-<hash>.css`, `/media/*` | ASSETS, Worker never runs |
| `/__config` | Worker — reads `env.API_URL` |
| `/`, `/customers/123`, any deep link | Worker → `AngularAppEngine` → CSR shell |

`not_found_handling` stays at its default. Setting it to `single-page-application` would
serve the shell from the asset layer and **bypass the Worker**, which would break `/__config`
routing assumptions and block any future `RenderMode.Server` flip. Do not set it.

`_redirects` (both apps) and `superadmin/public/_routes.json` become dead once the Worker
owns the SPA fallback — deleted in CP-4 / CP-7.

## 2. The config contract

```jsonc
// GET /__config  ->  Cache-Control: no-store
{ "apiUrl": "https://manttio-api.dasom-mx.workers.dev" }
```

`no-store` is load-bearing: it is what makes a dashboard variable change take effect on the
next page load instead of the next build. That is the whole point of the exercise.

Only genuinely per-deploy values belong here. `production` and `bypassAuthGuard` stay
compile-time — they are build identity, not deployment identity. The response is an
**overlay** on the compiled `environment`, so adding a key later needs no client change.

`apiUrl` is **not a secret** — it ships to every browser regardless. Set it as a plain
Cloudflare environment variable, not an encrypted one; encrypting only costs the ability to
read the value back when debugging a bad deploy.

## 3. The Angular runtime-config layer

Small surface, because `environment.apiUrl` is referenced in **three files total**:

- `superadmin/src/app/services/http/remote.service.ts`
- `superadmin/src/app/services/http/notifications.service.ts`
- `frontend/src/http/remote.service.ts`

All three read it in a field initializer (`private readonly base = environment.apiUrl…`),
which runs at service construction — after the initializer has resolved. A mutable module
object is therefore enough; no DI token, no signal.

```ts
// app/config/runtime-config.ts  (shape only — CP-1 writes the real thing)
export const runtimeConfig = { ...environment };
export async function loadRuntimeConfig(): Promise<void> { /* fetch, overlay, persist */ }
```

**The initializer-ordering trap.** `app.config.ts` in both apps already does real work in
`provideAppInitializer` — superadmin dispatches `LoadBrand()` + `LoadMe()`; the field app
dispatches `LoadPendingReports()`, `LoadPendingVisitActions()`, `LoadBrand()` and injects
`OfflineSyncService`. Angular starts all
initializers concurrently and waits for the resulting promises — it does **not** run them
in sequence. Adding config-loading as a second `provideAppInitializer` would let
`LoadBrand()` fire against a stale `apiUrl` — and in the field app, `OfflineSyncService`'s
reconnect watcher could start flushing the queue at the old host. The existing initializer
must therefore be folded into one that awaits the config first, then dispatches. The Dexie-only
loads (`LoadPendingReports`, `LoadPendingVisitActions`) are local and order-independent, but
there is no reason to split them out:

```ts
provideAppInitializer(async () => {
  await loadRuntimeConfig();
  const store = inject(Store);
  store.dispatch(new LoadBrand());
  if (store.selectSnapshot(AuthState.token)) store.dispatch(new LoadMe());
});
```

**Fallback chain**, in order: `/__config` response → last-known value from `localStorage` →
the compiled `environment` literal. The last rung is what keeps `ng serve` working with no
changes at all: there is no `/__config` under the dev server, the fetch fails, and
`environment.development.ts` applies exactly as it does today.

**The fetch must be abort-guarded** (`AbortSignal.timeout`, ~3s). A hung request on a flaky
connection would otherwise block bootstrap indefinitely — merely annoying in the admin,
unacceptable in a field app that is expected to start on a rooftop with one bar.

## 4. Checkpoints

Two independent legs: **CP-1…CP-4** move `superadmin/`, **CP-5…CP-7** move `frontend/`.
The frontend leg may start before the superadmin leg finishes, but CP-5 should not land
until CP-1's shape is settled — it is the same layer written twice, and one review of it
is enough.

### CP-1 — superadmin: runtime-config layer (no SSR)
- [x] `app/config/runtime-config.ts` — `runtimeConfig` overlay object + `loadRuntimeConfig()`
      with the §3 fallback chain and an `AbortSignal.timeout` guard
- [x] Fold the existing `provideAppInitializer` into one that awaits config **before**
      dispatching `LoadBrand()` / `LoadMe()` (§3 ordering trap)
- [x] Migrate `services/http/remote.service.ts` + `services/http/notifications.service.ts`
      off `environment.apiUrl`
- [x] `npm run build` green; `ng serve` behaviour unchanged — verified: the dev server
      answers `/__config` with **200 `text/html`** (the SPA shell), so `res.json()` throws
      and the chain falls through to the compiled literal. The live Pages deploy behaves
      identically, because `_redirects` also serves `index.html` with a 200
- [x] Verified safe to merge onto the *current* Pages deploy with no visible change

### CP-2 — superadmin: SSR scaffolding, all routes CSR
- [ ] `ng add @angular/ssr` (Angular 21 line)
- [ ] `app.routes.server.ts` = single `{ path: '**', renderMode: RenderMode.Client }`
- [ ] Confirm `outputMode: server` + `ssr.entry` landed in `angular.json`
- [ ] Build green; browser output now emits `index.csr.html`; `ng serve` unaffected

### CP-3 — superadmin: Worker entry + wrangler config
- [ ] `cloudflare/worker.ts` — `fetch(request, env, ctx)`: `/__config` from `env.API_URL`
      (`Cache-Control: no-store`), everything else delegated to `AngularAppEngine`
- [ ] `wrangler.jsonc` — `main`, `assets` (directory + `ASSETS` binding),
      `compatibility_flags: ["nodejs_compat"]`, `define` shim for `import.meta.url`
- [ ] `not_found_handling` left at default (§1 — setting it would bypass the Worker)
- [ ] `wrangler dev`: deep link renders, `/__config` returns the var, hashed assets bypass
      the Worker, boot smoke test passes (§5.2)
- [ ] Worker bundle size measured against the limit (§5.5)

### CP-4 — superadmin: cutover
- [ ] Worker project created; `API_URL` set for production **and** preview scopes
- [ ] Deployed; full login → dashboard → list-page flow verified on `workers.dev` **before**
      any DNS change
- [ ] Domain re-pointed
- [ ] Delete `public/_routes.json` + `public/_redirects`
- [ ] Pages project retired only after the Worker serves the domain

### CP-5 — frontend: runtime-config layer + offline persistence
- [ ] Runtime-config layer mirroring CP-1 (single call site: `src/http/remote.service.ts`)
- [ ] Folded initializer, same ordering fix as CP-1 — `LoadBrand()` **and** the
      `OfflineSyncService` injection must sit after the config resolves
- [ ] Persist each successful `/__config` response to `localStorage`; boot reads it when
      the fetch fails (not optional here — the field app boots offline routinely)
- [ ] Offline-boot test: install, go offline, reload, confirm the API host still resolves
- [ ] Build green

### CP-6 — frontend: SSR + service-worker reconciliation
- [ ] `ng add @angular/ssr@20` (frontend is on the Angular **20** line)
- [ ] `app.routes.server.ts` = single `RenderMode.Client` catch-all
- [ ] `ngsw-config.json` reconciled with `index.csr.html` — both `"index"` and the `app`
      asset-group `files` entry
- [ ] Full SW cycle exercised against a real build: install → offline reload → update to a
      new deploy → confirm no stale shell (§5.1 — do not infer this from a green build)
- [ ] Dexie/offline queue boot smoke test under `wrangler dev` (§5.2)

### CP-7 — frontend: cutover
- [ ] Worker project + `wrangler.jsonc`, `API_URL` set for both scopes
- [ ] Backend-generated dynamic PWA manifest + icons resolve through the assets binding
- [ ] Deployed and verified on `workers.dev`; domain re-pointed
- [ ] Delete `public/_redirects`

---

## 5. Risks

1. **Service-worker shell caching (CP-6)** — the highest-risk item in the suite. A stale
   `ngsw` shell against a renamed index file can leave installed clients booting an old
   app. Exercise the update cycle explicitly; do not infer it from a green build.
2. **Import-time browser globals in the server bundle.** With all routes CSR the app is
   never rendered server-side, but the server bundle still *imports* the app config graph,
   so any module-scope access to `localStorage` / `indexedDB` / `window` would throw inside
   the Worker. Checked: `frontend/src/offline/offline.db.ts` only *declares*
   `class OfflineDb extends Dexie` — no module-scope instantiation — and NGXS-storage is
   configured at provider-construction time, not import time. Both apps still get a
   `wrangler dev` boot smoke test.
3. **Blocking round-trip at boot.** Same-origin and tiny, but it is on the critical path.
   If it measures badly, the fix is decision 2's rejected alternative (HTMLRewriter
   injection into `<head>`), which removes the RTT at the cost of a per-request shell.
4. **Domain cutover.** Two live apps change origin infrastructure. Deploy the Worker on its
   `workers.dev` hostname and verify a full login → dashboard → list-page flow *before*
   moving DNS.
5. **`nodejs_compat` / bundle size.** Angular's server bundle plus polyfills must fit the
   Worker size limit. Measured at CP-3; if it binds, the all-CSR setting means the server
   render path itself could be trimmed.

## 6. Rollback

Every checkpoint is independently revertible, and the two legs are independent of each
other. CP-1/CP-5 are inert without a Worker. CP-2/CP-6 add build outputs that nothing reads
until CP-3/CP-7 wire them. Until the domain moves, the existing Pages deployment stays live
and authoritative — cutover is the only irreversible step, and it reverses by re-pointing
DNS back.


---

## Checkpoint board

Legend: ☐ not started · ◐ in progress · ☑ done

| CP | App | Scope | State | PR |
|---|---|---|---|---|
| CP-1 | superadmin | runtime-config layer + folded initializer + 2 call sites | ☑ | — |
| CP-2 | superadmin | `@angular/ssr`, all routes `RenderMode.Client` | ☐ | — |
| CP-3 | superadmin | Worker entry + `wrangler.jsonc` + `/__config` | ☐ | — |
| CP-4 | superadmin | CF project, vars, deploy, domain cutover, delete `_routes.json`/`_redirects` | ☐ | — |
| CP-5 | frontend | runtime-config layer + `localStorage` offline persistence | ☐ | — |
| CP-6 | frontend | `@angular/ssr@20` + `ngsw-config.json` reconciliation | ☐ | — |
| CP-7 | frontend | Worker + deploy + cutover | ☐ | — |

Update the `Status:` line at the top of this file as legs complete, and fill the PR column
on merge — same convention as 21.
