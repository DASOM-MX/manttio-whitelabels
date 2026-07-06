# 14 — Access control (roles + config gating)

> **Status:** done (doc — implementation tasks live in `02-app-shell.md` and each module's
> checklists) · **Last updated:** 2026-07-05

Reference doc, binding for all module agents. Gating is **two-dimensional**; keep the axes
separate everywhere:

1. **Tenant config** (set by *us* via the manager push): which modules this tenant's
   instance even has. `modules: { billing, wms, crm, cms, scheduling }` — users, reports,
   and clients are core and always on; **equipment rides core clients**,
   **`scheduling` covers calendar (12) + contracts (13)** (tentative flag split — open
   item), and **brand identity rides core** (the `cms` flag gates content editing only —
   note 5). A tenant without `wms` never renders the Warehouse nav, regardless of role.
2. **User role** (set by the tenant's owner/admin in module 05): what a user can do within
   the enabled modules.

The **backend is the sole authority** — every endpoint enforces config + role on its own.
Everything in this doc about rendering/guards is UX and bundle hygiene, not security.

---

## 1. Roles (v1 — decided 2026-07-05)

Baseline four, no specialist roles until a real tenant needs one:
`'owner' | 'admin' | 'office' | 'technician'`

## 2. Access matrix

| Module | owner | admin | office | technician |
|---|---|---|---|---|
| Users | full | full¹ | — | — |
| Reports | full | full | manage | **own only**² |
| Clients + CRM | full | full | full | — |
| Equipment (11) | full | full | full | — |
| Calendar (12) | full | full | full | **own visits + swap**⁴ |
| Contracts (13) | full | full | **draft only**³ | — |
| Billing | full | full | **draft only**³ | — |
| Branding (03) | full⁵ | read-only⁵ | — | — |
| CMS (04) | full⁵ | full⁵ | — | — |
| WMS | full | full | **operational** (§2.1) | **van + self-checkout** (§2.1) |

1. **Owner protection:** admins cannot edit, delete, or change the role of the `owner`
   account, and cannot grant `owner`. UI hides those actions; backend enforces.
   **Password resets (decided 2026-07-05) follow the same hierarchy:** only the
   **owner** can reset an **admin's** password; owner **and** admins can reset
   **office/technician** passwords; **nobody in-tenant resets the owner's** (a locked-out
   owner goes through us via the manager — there is no forgot-password flow in v1,
   `02-app-shell.md` §3). UI hides the reset action outside these pairs; backend
   enforces on the endpoint. Resets issue a **temporary password + forced change at
   next login** (unskippable dialog — mechanics in 05 §2 / 02 §3).
2. **Technician scope (decided 2026-07-05):** technicians *can* log into superadmin;
   their world is: **Calendar** (own visits + team read-only, note 4), **My reports**
   (own reports — read-only *except* recording material consumption, §2.1),
   **My warehouse** (own van stock + consumption history + self-checkout, §2.1), and
   **Stock lookup** (global read-only). Backend scopes every query; the UI reuses the
   full components with locked filters + hidden actions.
3. **Billing + Contracts (decided 2026-07-05):** money commitments gate the same way —
   office creates/edits **drafts** (incl. the bill-by-report picker); `send` /
   `mark paid` / `cancel` (bills) and `activate` / `cancel` (contracts) are owner/admin
   actions. Contract detail: `13-contracts.md` §2.
4. **Calendar (decided 2026-07-05):** owner/admin/office schedule, edit, and reassign
   any visit; technicians see the full team calendar **read-only** and have exactly one
   write: **swapping a visit currently assigned to them** to another technician (give
   away, never take). All reassignments — staff or swap — go through the same audited,
   append-only assignment history. Detail: `12-calendar.md` §2.
5. **Branding vs CMS (decided 2026-07-05):** two separate, independent modules. The
   **brand identity editor (03) is owner-only** (admin read-only) — same
   owner-customization precedent as contract types — and **core**: it renders even
   when the tenant `cms` flag is off (it themes the apps and PDFs, not just the
   website). CMS *content* (04, `cms_home`/`cms_clients`) is owner + admin, behind the
   `cms` flag, and **headless** — served API-first; the public site is one consumer.
   Detail: `03-branding.md` §1 / `04-cms.md` §1.

### 2.1 WMS action matrix (decided 2026-07-05)

WMS permissions are **action-level**, not module-level:

| WMS action | owner | admin | office | technician |
|---|---|---|---|---|
| Structure: warehouses, nodes, tech assignment | ✓ | ✓ | — | — |
| Materials catalog (SKUs) | ✓ | ✓ | — | — |
| Movement reasons: add / deactivate (custom; built-ins locked) | ✓ | ✓ | — | — |
| Inbound (receive deliveries) | ✓ | ✓ | ✓ | — |
| Replenishments (register via file import + evidence photos) | ✓ | ✓ | ✓ | — |
| Transfer (any → any) | ✓ | ✓ | ✓ | — |
| **Self-checkout** (→ own van) | n/a | n/a | n/a | ✓ᵃ |
| **Readjustment** (compensating in/out; mark lost/damaged)ᵈ | ✓ | ✓ | — | — |
| Consumption on reports | edit any | edit any | view | **own reports, from own van**ᵇ |
| Stock + movements visibility | all | all | all | own van in full; global stock **read-only lookup**ᶜ |

a. **Self-checkout:** a technician executes a transfer whose **destination is locked to
   their own van** and whose **source excludes any warehouse assigned to another
   technician** (no raiding colleagues' vans). It's a normal audited `Movement`
   (`userId` recorded). A per-warehouse "allow self-checkout" flag is a possible later
   refinement — default is all non-technician warehouses.
b. **Consumption — tech records, staff corrects:** the technician attaches materials
   (from their own van) to their own reports; owner/admin can edit/fix any report's
   materials afterwards. Office sees the materials block read-only.
c. **Stock lookup:** search materials, see quantities per warehouse ("does the shop
   have this compressor?") — no movement rights, no readjustment visibility needed.
d. **Audit immutability (decided 2026-07-05):** movement records are **append-only** —
   never edited or deleted, by anyone, ever. Every movement carries a structured
   `reason` (enum in `10-wms.md` §1); every correction is a new `readjustment` movement
   (`direction: in|out`, reason + notes required, owner/admin only); staff corrections
   to report materials emit compensating readjustments while the original consumption
   movement stands. Details: `10-wms.md` §1.

## 3. How gating is implemented (CSR v1 — decided 2026-07-05)

Superadmin ships **CSR** (SSR comes later, §5). The gating input is fetched once and
everything reads from it:

- **`GET /auth/me` → `{ user, role, tenantConfig }`** — fetched after login and on app
  boot when a token exists; stored in `AuthState`. The shell shows a splash until it
  resolves; no gated UI renders from stale/absent data.
- **`access.ts` (single source):** the matrix above as data, plus `hasRole` / `hasModule`
  helpers. Route `data`, the nav filter, and in-page `@if`s all consume it — matrix logic
  is never duplicated in components.
- **Routing:** every routed page declares `data: { module: 'billing', roles: [...] }`;
  one central `canMatch` guard evaluates it against `AuthState`. Blocked modules never
  match, so their lazy bundles are never requested.
- **Nav:** sidebar builds from the same route/access data — a user never sees an entry
  the guard would reject.
- **In-page gating** (e.g. hiding "Mark paid" from office) is plain `@if` on the
  `hasRole(...)` helper.
- Auth transport stays **frontend-parity**: JWT in `AuthState`, interceptor attaches the
  header, no frontend JWT decoding — role comes from `/auth/me`, never from the token.

## 4. Module agent obligations

- Declare `module` + `roles` in route `data` for every routed page.
- Hide role-forbidden actions with the `hasRole` helper; never disable-only (a disabled
  "Delete" still advertises the capability).
- Technician-scoped pages (06, 10) reuse the full components with locked filters +
  hidden actions — don't fork variants.
- Treat every 403 as normal flow (toast + stay), since config/role can change under a
  live session.

## 5. Future SSR upgrade (when client volume justifies it)

Deliberately deferred (2026-07-05). When we flip, the changes are confined to the shell:

- `ng add @angular/ssr` re-scaffolds the server; hosting moves from Pages static to a
  Workers SSR handler.
- Auth moves from localStorage JWT to an **httpOnly cookie session** so the server can
  resolve `/auth/me` per request; result reaches the client via `TransferState` instead
  of a boot fetch.
- Server-side, nav/route availability is computed before render — gated modules stop
  shipping any markup or bundle references at all.
- **What doesn't change:** the matrix, `access.ts`, route `data` declarations, the
  `canMatch` guard, in-page `hasRole` gating, and backend authority. That invariance is
  why gating must stay centralized — module agents who follow §4 need zero changes for
  the SSR move.

## Open items
- Per-warehouse "allow self-checkout" flag (§2.1 note a) — only if the
  all-non-tech-warehouses default proves too loose.
- Should office also correct report materials (currently owner/admin only, §2.1 note b)?
  Revisit once real correction traffic exists.
- Whether `crm` is really a separate config flag or rides with core clients — confirm
  when the manager push schema is defined.
- `scheduling` flag scope (§1): calendar + contracts together, or split? And does
  equipment really ride core clients? Confirm with the manager push schema.
- Technician swaps without approval (note 4) — add an office-approval step only if
  abused (`12-calendar.md` open decisions).
