# 24 — Global search (the topbar's ⌘K palette)

> **Status:** planned — opened 2026-08-27 out of plan 23 § Open ①. The owner chose to
> **ship the chrome now and plan the capability** rather than leave the topbar bare: 23
> CP-2 landed `.topbar-search` as a deliberately `disabled` field, and this plan is what
> makes it real. Nothing here is started.
> **Owner:** planning session 2026-08-27 · **Last updated:** 2026-08-27
> **Scope:** `backend/` + `superadmin/`. The field app does not get a global search —
> a technician's world is their own calendar and reports, both one tap away already.
> **Depends on:** 23 CP-2 (the stub this replaces) · 14 (access matrix) · 21 (the
> `GenericQueryResponse<T>` envelope and the paging idioms this borrows from).

## Problem

The reference console's headline topbar affordance is a search field, and superadmin has
nothing behind it. Today, finding one client, one order or one quote means: pick the
right module from the nav, land on its list, type into *that* list's filter, and page.
Staff who work across modules — office scheduling against a quote, an admin chasing a
folio someone read to them over the phone — pay that tax on every lookup, and the folio
they were read (`OS-0142`) is often the only thing they know.

A cross-module search is also the only honest way to retire the stub. A disabled control
is a promise; this plan is the schedule for keeping it.

## Direction

**One endpoint, one overlay, folio-first.**

1. **`GET /search?q=` — one request, grouped results.** The server searches every entity
   the caller may read and returns them grouped by kind, each group capped. Not a
   fan-out of nine list calls from the client: the cap, the ranking and the gating are
   the server's job, and a client fan-out would leak "this module exists" through
   response shapes.
2. **The result set is gated on the server, never in the UI.** A caller who cannot read
   quotations gets no `quotations` group — not an empty one, not a hidden one. Same rule
   as every restricted field in this codebase: omit from the body, don't ship-and-hide.
3. **Folio-first ranking.** An exact folio match (`OS-0142`, `COT-0091`, `RPT-0007`,
   `CTR-0012`) outranks everything, in its own group at the top. Names, `internalServiceCode`,
   client RFC and contact e-mail follow. This is the actual lookup people do.
4. **Soft-deleted rows never appear.** Reads filter `isNull(deletedAt)` like every other
   read helper — a search that resurrects tombstones would be the loudest possible
   violation of the no-hard-deletes contract.
5. **The overlay is a palette, not a dropdown.** A centered overlay over a scrim, opened
   by the topbar field or by `⌘K` / `Ctrl+K`, closed by `Esc`. Grouped rows with a kind
   label, keyboard-first (`↑`/`↓` move, `Enter` navigates), and every row is a real route.
6. **Debounced, cancelable, and empty-state honest.** ~250 ms debounce, in-flight request
   canceled on the next keystroke, a distinct "escribe para buscar" idle state and a
   "sin resultados" empty state — never a spinner that resolves into nothing.

## Checkpoints

One PR per checkpoint, stacked, base `main`.

### CP-1 — Backend `GET /search`
- [ ] `modules/search/` — controller + service + repository, following the module-first
      layout (no new cross-module imports beyond each domain's repository)
- [ ] Zod validator: `q` required, trimmed, min 2 chars, max 100; a short `q` is a 400,
      not a full-table scan
- [ ] Per-kind caps (5 rows each) and a total cap; the response carries the kind, the id,
      the display label, a secondary line, and the folio when the entity has one
- [ ] Gating: each group is assembled only when the caller's `(module, role)` allows the
      corresponding list read — the same matrix the list endpoints use, not a copy
- [ ] Every query filters `isNull(deletedAt)`; the technician tier searches only what the
      field app would show them
- [ ] Response shape decided against the house envelope (§ Open ①)
- [ ] Vitest coverage: gating per role, folio-exact ranking, tombstones excluded, the
      2-char floor

### CP-2 — The palette (superadmin)
- [ ] `SearchService` under `app/services/http/`, state under `src/state/search/`
- [ ] `global-search` component in `shared/components/` — overlay + scrim + grouped rows,
      the plan 23 overlay-panel idioms (CP-6 lands those; reuse, don't fork)
- [ ] `.topbar-search` stops being `disabled` and opens the palette; the `⌘K` hint becomes
      a real binding, rendered per platform (`⌘K` on Mac, `Ctrl K` elsewhere — the hint
      must not lie about the key)
- [ ] Debounce + cancelation; idle / loading / empty / error states all distinct
- [ ] Keyboard: `⌘K`/`Ctrl+K` opens from anywhere, `Esc` closes and restores focus to the
      trigger, `↑`/`↓`/`Enter` drive the list, focus is trapped while open
- [ ] Playwright spec: stub `/search`, open by shortcut, type, assert the grouped rows
      and that `Enter` navigates to the right route
- [ ] The plan 23 § Open ① note in `01-conventions.md` + the design-skill mirror flip from
      "stub" to shipped, in the same commit

### CP-3 — Recents + reach
- [ ] Recent picks (per user, `localStorage`) render as the idle state instead of a bare
      prompt — the second-best lookup after the one you just did
- [ ] Mobile: the topbar's search affordance below `md` (§ Open ②)
- [ ] `prefers-reduced-motion` collapses the overlay transition
- [ ] Full a11y pass: `role="dialog"` + label, `aria-activedescendant` on the list,
      screen-reader result counts

## Verification

- No group is ever present-but-empty for a caller who cannot read that module — assert on
  the response body, not the rendered UI.
- A soft-deleted client, order and quote are each unreachable through search.
- The `⌘K` hint matches the key that actually works on the running platform.
- Typing fast never renders a stale result set (cancelation, not just debounce).
- Keyboard-only: open, search, choose, escape — no pointer at any step.

## Decisions

- **Locked (2026-08-27, owner, via 23 § Open ①):** the topbar search is **built**, not
  dropped — the stub is chrome with a schedule behind it, and 24 CP-2 is what removes the
  `disabled` attribute.
- **Derived (2026-08-27, planning):** one server-side endpoint rather than a client
  fan-out · gating omits groups instead of emptying them · folio-exact wins the ranking ·
  tombstones never surface · the field app is out of scope.

## Open — decide at the CP that needs it

- ① **Response shape.** `GenericQueryResponse<T>` is the house envelope for *one* paged
  collection; a grouped multi-kind result is not that. Either a bare
  `{ groups: [{ kind, items }] }` (honest, but a second shape to teach) or one flat
  `GenericQueryResponse<SearchHit>` with `kind` on each hit and grouping done client-side
  (one shape, but `total` and per-kind caps get muddy). **CP-1.**
- ② **Mobile reach.** Below `md` the topbar has no room for the field. An icon that opens
  the same palette, or no global search on phones at all — decide once the palette exists
  and can be felt on a small screen. **CP-3.**
- ③ **Does search cross the tenant's own archive?** Blacklisted and "Archivados" clients
  are live rows with a status, not tombstones — surface them with their status pill, or
  keep them out of the default result set behind a filter. **CP-1.**
