# 10-wms / 09 — Technician surfaces + closing sweep (frontend)

> **Status:** not-started · **Depends on:** 06, 08 (and everything else — this closes
> the module)
> **Owner:** — · **Last updated:** 2026-07-19

The technician's two WMS entries — **Mi almacén** (`/warehouse`, exact) and **Consulta
de stock** (`/warehouse/stock`), both already in `TECH_NAV` — plus the module-wide
role/polish closing sweep. Everything here **reuses the staff components with locked
filters + hidden actions** (14 §2 note 2 — no forked variants; if a reuse forces a
fork, the reused component is wrong — fix it there).

---

## 1. Page — `wms/pages/my-warehouse/` (technician `''` route)

Replaces the technician `ModuleStub` record; staff never match it (guard order —
overview §4).

- **No assigned van:** empty state ("No tienes un almacén asignado — pide a tu
  administrador que te asigne uno") — no data calls beyond the lookup.
- **Header card:** their van's warehouse card (04's header reused sans staff actions):
  name, parent link suppressed, address/notes read-only.
- **Stock section:** the van's stock — 04's stock panel reused at warehouse scope
  (their `GET /warehouses/:id/stock` — backend admits the assigned technician, 02 §2).
  Serialized units with status pills; unserialized with quantities.
- **Self-checkout entry:** primary button "Tomar material" → 06's `transfer-dialog` in
  `mode='self-checkout'` (destination locked to the van, source excludes colleagues'
  vans, reason fixed `relocation` — 06 §5; backend enforces, 02 §4).
- **Consumption history tab:** 06's `movements-table` with base filter = their van +
  their reports (the backend scoping already returns exactly this — pass no warehouse
  filter, let the server scope; 02 §4). This page owns the URL params for its
  filters/page (`ListQueryService`).

## 2. Page — `wms/pages/stock-lookup/` (`/warehouse/stock`, technician)

"Does the shop have this compressor?" — global read-only quantities:

- 05's `materials-list` reused: search + tracking filter + total stock; **all actions
  hidden** (already `hasRole`-gated — verify none leak), row click → 05's
  `material-view` reused read-only: per-warehouse quantities visible, **no movements
  section, no stock-op buttons, no readjustment visibility** (§2.1c — quantities only).
  The material-view takes a `lookupMode` derived from role (computed, not an input
  fork) suppressing the movements slot.
- Same routes/components, route `data.roles: ['technician']` on the lookup records
  (staff use the `materials` routes — overview §4).

## 3. Closing sweep (module-wide — the original CP-6 polish items)

- **Route `data` audit:** every wms page declares `{ module: 'wms', roles: [...] }`
  per overview §4; `canMatch` guard order verified (tech `''` before staff `''`).
- **Office gating audit:** office reaches lists, views, inbound, transfer,
  replenishments; never sees structure/catalog mutations, readjustment, or the
  report-materials edit mode. Grep for `hasRole` on every action affordance.
- **403-as-normal-flow:** every wms dispatch path toasts + stays on 403 (role can
  change under a live session — 14 §4).
- **Dark-mode audit** across all nine pages + six dialogs; empty/loading/error states
  everywhere (skeletons for content regions, spinners only in buttons).
- **Final manual pass (original CP-6, binding):** create warehouse + sub + rack/box →
  inbound 10 pza + 2 serials → transfer to tech van → tech self-checkout 1 pza →
  tech attaches materials to their report → stock decremented everywhere, movement
  history coherent, admin correction emits compensation → stock restored.

## 4. Testing

- e2e: technician journey (login as tech fixture → Mi almacén renders van stock →
  self-checkout dialog locked fields → history scoped); stock-lookup journey (search
  → material view shows quantities, no movements/actions); staff can't reach
  `/warehouse/stock`; office sweep per §3.

---

## Checkpoints

### CP-1 — Mi almacén
- [ ] Technician `''` route + guard; no-van empty state
- [ ] Van card + stock section (04 reuse), self-checkout entry (06 dialog mode),
      consumption history tab with URL-owned filters

### CP-2 — Stock lookup + module close
- [ ] `stock` route on reused materials pages, lookup mode suppressions verified
- [ ] §3 sweep complete (route data, office audit, 403 flow, dark mode, states)
- [ ] Build green; e2e green; **final manual pass recorded with date**; overview §7
      board + `../00-master-plan.md` §3 row flipped to done

## Open decisions / asks
- Per-warehouse "allow self-checkout" flag stays a 14 open item — do not build; default
  is all non-technician warehouses.
- Should staff (office) also get `stock` as a quick lookup? They have `materials` —
  keep tech-only unless office asks.
- My-warehouse consumption history: include self-checkout transfers (yes — they touch
  the van) — confirm the server scoping reads naturally in the UI; adjust the base
  filter only if the mix confuses (then split tabs: Movimientos / Consumos).
