# 22 — Brand palette: **primary + accent** (surface goes fixed-neutral)

> **Status:** in progress 2026-08-26 — **CP-1…CP-3 done**, CP-4 + CP-5 open
> **Owner:** planning session 2026-08-26 · **Last updated:** 2026-08-26
> **Scope:** all four packages (`backend/`, `superadmin/`, `frontend/`, `website/`) —
> one suite, sequenced CP-1…CP-5.
> **Supersedes:** **plan 16** in full. 16's target convention (two tenant scales =
> `primary` + `surface`) is replaced by *one* tenant pair `primary` + `accent` with a
> **fixed** neutral surface; 16's deferred **PR-1 (frontend)** and **PR-3 (website)** are
> absorbed here as CP-3/CP-4 (their mechanical `granite`/`sky`/`navy`/`cyan` sweep survives
> verbatim — only the target names change). 16 PR-2 (superadmin, shipped 2026-07-21) stands;
> CP-2 edits its output.
> **Amends:** 01-conventions § Design language ("Accent step: `primary-400` is the decorative
> accent" — a workaround for the missing scale; accent becomes a real scale) and the committed
> `.claude/skills/superadmin-design` mirror. **Blocks:** plan 23 (the v2 visual language is
> authored on these names — same reasoning that front-ran 16 PR-2 for the shell redesign).
> **Cross-repo:** the whitelabel **manager** app writes brand rows (`PUT /brand` push) and
> lives outside this repo — the wire change needs a coordinated release (§ Manager-app coordination).

## Problem

1. **`surface` is the wrong thing to let a tenant pick.** It is the chrome neutral —
   page background, card tint, borders, body text, table rules. Making it tenant-configurable
   means every tenant's chrome contrast is a per-tenant gamble (a saturated or mid-lightness
   "surface" quietly breaks WCAG across all four surfaces at once), and the brand editor asks
   the tenant a question they have no way to answer well.
2. **There is no second brand color.** Plan 17 had to nominate `primary-400` as "the
   decorative accent" (01 § Design language) — a single-hue workaround. Every categorical
   cue in the product (chart series, badges, segmented bars, highlight states) is therefore a
   tint of one hue, which is exactly what plan 23's reference style cannot be built on.
3. **The names then stop being honest.** Once surface is fixed, `--brand-surface-*` is a
   variable that never varies; keeping it invites the next dev to theme it.

## Target contract (canonical)

| | Tenant-configurable | Scale name | CSS vars | Tailwind |
|---|---|---|---|---|
| Brand anchor | ✅ | `primary` | `--brand-primary-0…1000` | `bg-primary-600` |
| Brand accent | ✅ **(new)** | `accent` | `--brand-accent-0…1000` | `bg-accent-500` |
| Chrome neutral | ❌ **fixed** | `surface` | *none* | `bg-surface-100` |

1. **Wire:** `BrandColors = { primary: HslScale; accent: HslScale }`. Steps `0…1000` by 100,
   HSL components `"H S% L%"` — branding rules 2–3 unchanged. `surface` leaves the contract.
2. **`surface` stays a Tailwind scale in superadmin and the website, and in their PrimeNG
   presets** — same utility names, same 11 steps, same `<alpha-value>` plumbing — but its
   values are **literal HSL components**, not `hsl(var(--brand-surface-N, …))`. No sweep of
   the ~972 superadmin `surface-*` instances: they keep working and keep meaning "chrome
   neutral".
   **Amended 2026-08-27 (owner) — the field app is the exception:** `frontend/` uses **stock
   Tailwind `zinc`** instead of a bespoke `surface` scale. Once surface left the contract there
   was nothing tenant-specific left to express, and a hand-maintained neutral that merely
   *imitates* a stock palette is config with no payer. See § Decisions.
3. **The fixed neutral is exactly today's default surface** — hue `0`, saturation `0%`,
   `L` by step `0:98 · 100:96 · 200:90 · 300:82 · 400:70 · 500:55 · 600:45 · 700:36 · 800:28 ·
   900:18 · 1000:10` (`backend/…/constants/default-brand.ts`, mirrored in every
   `tailwind.config`). Picking today's default makes CP-1…CP-4 **value-neutral for any tenant
   that never customized surface** (§ Verification catches the ones that did). Retuning the
   neutral (e.g. the reference's slightly cool canvas) is a **plan 23 CP-1** decision — by then
   it is a four-line edit with zero tenant impact.
   Exception kept: the presets' `surface.0` stays pure `#FFFFFF` (frontend `manttio-preset.ts`
   already anchors it) — cards are white, the page tint is `surface-100`.
4. **Single-value aliases (16 § Target 3) survive, repointed:** `background` = `surface-100`
   (superadmin) / `surface-0` (frontend, website), `surface` DEFAULT = `surface-100`,
   `primary` DEFAULT = `primary-600`, `dark` = `surface-800`. **`secondary` retires** — it
   was `primary-300`, i.e. the missing-accent workaround; `accent` DEFAULT = `accent-500`
   takes the role. Legacy-name tombstones (16 § Target 2) stay as-is: `granite`/`sky`/`navy`/
   `cyan` remain empty objects forever, because `theme.extend` merges with the default theme.
5. **Accent's default is neutral, not a fake brand color** (branding rule 3): `DEFAULT_BRAND`
   seeds `accent` with the same neutral ramp as `primary` (`220 10%`), so a brandless instance
   renders gray chrome instead of inventing a hue.

## Current reality (inventory, 2026-08-26)

| Package | On semantic names? | `primary-N` | `surface-N` | Legacy `granite/sky/navy/cyan-N` |
|---|---|---|---|---|
| `superadmin/` | ✅ (16 PR-2, 2026-07-21) | 211 | 972 | 0 |
| `frontend/` | ❌ still legacy | 1 | 1 | ~590 (16's snapshot) |
| `website/` | ❌ still legacy | 0 | 0 | ~120 (16's snapshot) |

**Re-run both counts when the CP starts** — 16's frontend/website figures are a 2026-07-15
snapshot.

**Correction (2026-08-26, CP-2):** superadmin's legacy count is **not** 0. Four constants
written after 16 PR-2 reach for stock Tailwind names the tombstones kill —
`service-order-event-chip-classes.const.ts` (`sky` chip), `service-order-priority-flag-classes`
and `-label-classes` (`sky` = Low), `technician-dot-palette.const.ts` (`bg-cyan-500`). Verified
against the built stylesheet: `.bg-sky-100` and `.bg-cyan-500` emit **zero** rules, so those
chips, flags and dots render colorless in the shipped app today. This is the tombstones working
as designed (16 § Target 2 chose silence over stock blue), and it is **out of scope here** —
CP-2 is vocabulary-only. Fixing it is a design call about which non-brand hue those categorical
cues should use, and it belongs with plan 23's palette-roles pass or its own fix PR.

Wire-contract consumers found (`colors.surface` / `colors.primary` reads):

- `backend/src/modules/brand/` — `dtos/brand.dto.ts` (`BrandColors`), `validators/brand.validator.ts`
  (`saveBrandSchema.colors`), `models/brand.model.ts` (jsonb `$type`), `constants/default-brand.ts`,
  `services/brand-icons.service.ts` (**`colors.surface['0']` = the generated PWA icon's
  background plate**).
- `backend/src/modules/reports/helpers/` — `report-email.helpers.ts` (6 surface reads:
  pageBg/panelBg/bodyText/border/footnote/closing/outerFooter), `report-pdf.helpers.ts`
  (fill = surface-100, border = surface-300).
- `backend/src/modules/quotations/helpers/` — `quotation-email.helpers.ts` (5 surface reads),
  `quotation-approval-page.helpers.ts` (primary only).
- `superadmin/` — `services/theme/brand-theme.service.ts` (sets both var families),
  `services/theme/color-scale.service.ts` (`deriveScale(hex, anchorZeroAtWhite)` — the
  white-anchor flag exists *only* for surface), `data/dtos/brand.ts`, the brand editor
  (`branding/pages/brand-editor/` — two `app-scale-editor` blocks, `surfaceBase`/`surfaceScale`
  controls, preview slots, the "fixed status colors" callout), `tailwind.config.js`,
  `app/theme/manttio-preset.ts`.
- `frontend/` — `src/app/theme/brand-css.ts` (`scaleVars('surface', …)`),
  `src/app/theme/manttio-preset.ts`, `tailwind.config.js`.
- `website/` — `src/lib/theme.ts` (`scaleVars('surface', …)`), `src/lib/types.ts`,
  `tailwind.config.mjs`.

## Mechanics

### Storage migration

`brand.colors` is a single-row jsonb. Generate (never hand-apply — memory rule) a migration
that, for `id = 1`:

- adds `accent`, **seeded from the tenant's existing `primary`** — a deliberate value-neutral
  start: accent is live from minute one, visually identical to primary, and the owner re-picks
  it in the editor. (Seeding from `surface` would put a gray in an accent role; seeding a
  literal hue would invent a brand.)
- **leaves the legacy `surface` key in place, unread** — non-destructive and hand-reversible,
  the same tombstone reflex as 16 § Target 2. It disappears naturally on the first save
  (`z.object` strips unknown keys). No column is dropped; nothing is deleted.

`when` must beat the newest applied `__drizzle_migrations` row (memory rule) — the journal's
newest entry today is `0041_wms_node_assignments`; check the live table, not just
`_journal.json`, before generating.

### Backend surface reads → fixed neutrals

Every `colors.surface` read in emails/PDF/icons already has a neutral constant beside it
(`NEUTRAL_HEX_FALLBACKS`, `DEFAULT_PDF_THEME`). **Promote the fallback to the value**: delete
the brand lookup, keep the constant, keep the shape of the helper — with the constants retuned
to the fixed table's actual steps, so a default-surface tenant renders what it renders today.
`brand-icons.service.ts`'s icon plate becomes literal white.

**Documents adopt accent in this plan** (§ Decisions ②, owner 2026-08-26). One structural role
per document, and the same role in all of them — the band, never the button, because
primary stays what the reader is meant to act on (plan 23 § palette roles):

| Document | `primary` | `accent` |
|---|---|---|
| Report email | headings, labels, the download button (`primary-800`) | the footer band (`accent-800`) + its text (`accent-100`) |
| Quotation email | brand name, total, the CTA button (`primary-800`) | the footer band (`accent-800`) + its text (`accent-100`) |
| Report + quotation PDF | body ink (`primary-900`) | the section-header band (`accent-100`) |

The palettes' `accent` key — which meant *primary*-800 all along — is renamed `brandInk` in the
same pass; a key called `accent` that reads from `primary` is exactly the dishonesty this plan
exists to remove. With accent seeded from primary the first render is unchanged; the split
only becomes visible once the owner picks a real second color.

### Per-app palette layer

1. Tailwind config: `primary` + `accent` via the existing `brandScale()` helper (byte-identical
   plumbing, new name); `surface` becomes a literal-value scale built from the fixed table;
   aliases per § Target 4; tombstones untouched; rewrite the header comment (it currently
   teaches `--brand-surface-*`).
   > **Amended for the field app + website (owner, 2026-08-27):** they carry no `surface`
   > scale and no fixed table — they deleted it and use stock Tailwind `zinc-50…950`, with
   > `background` as the only surviving alias. As written above this step now describes
   > **superadmin only.** See § Decisions → *the field app's neutral is stock `zinc`*.
2. PrimeNG preset: `primary` reads `--brand-primary-*` (unchanged), `surface` reads the fixed
   literals, `accent` is exposed only where Aura has a slot for it (do **not** invent
   semantic tokens the components ignore — plan 23 CP-1 owns any real accent tokens). In the
   field app that same Aura `surface` token group is filled with zinc's hexes — the name is
   PrimeNG's, not ours.
3. Runtime apply: `BrandThemeService` / `brand-css.ts` / `theme.ts` set `--brand-primary-*` +
   `--brand-accent-*` and **stop emitting `--brand-surface-*`** (leaving a dead var set would
   re-invite theming).
4. Docs in the same PR (16 § Mechanics 4 rule): package `CLAUDE.md`, config header comments,
   01-conventions + the `superadmin-design` skill mirror.

### Brand editor (superadmin)

The second picker becomes **Acento**, not Superficie: `accentBase`/`accentScale`, no
white-anchoring (`deriveScale(hex, false)` — retire the now-unused `anchorZeroAtWhite`
argument rather than leaving a dead flag), hydration reads `colors.accent`, `save()` sends
`{ primary, accent }`, the preview slots show accent surfaces, and the copy explains the new
division of labor: *tu marca elige dos colores; el gris de la interfaz es fijo*. The existing
"fixed status colors" callout (red/amber/emerald/primary swatches) gains the accent swatch and
keeps warning about collisions.

## Manager-app coordination

The whitelabel **manager** (outside this repo — memory: it provisions owners and pushes the
tenant brand) is the other writer of `PUT /brand`. Its payload carries `colors.surface` today
and will be rejected the moment CP-1's validator lands, because `saveBrandSchema` is a strict
`z.object`.

Sequence it deliberately: land CP-1 behind a manager release that sends
`colors: { primary, accent }`, or take the compat path in § Decisions ① for one release. Either
way the manager's **color editor** needs the same two-picker rework as the in-tenant editor
(CP-2) — file that as a manager-side task in the same week, not "later": a manager that still
edits surface will keep pushing a key the backend strips, and the tenant's accent will silently
never change.

## Checkpoints

One PR per checkpoint, stacked, base `main`, in this order. **The order is the safety
property** — CP-1 changes the wire, so no consumer leg can land before it, and CP-2 must land
before plan 23 writes a single line of new chrome. CP-3 and CP-4 are independent of each other.

### CP-1 — Backend contract + migration (`feat(backend)`) — **done 2026-08-26**
- [x] `BrandColors` in `dtos/brand.dto.ts` → `{ primary: HslScale; accent: HslScale }`;
      `models/brand.model.ts`'s jsonb `$type` follows (it types off the DTO — no edit needed)
- [x] `saveBrandSchema.colors` → `z.object({ primary: hslScaleSchema, accent: hslScaleSchema })`,
      both required per § Decisions ①
- [x] `DEFAULT_BRAND.colors.accent` = the same neutral ramp as primary (`neutralScale(220, 10)`) —
      a brandless instance renders gray, never an invented hue (branding rule 3)
- [x] ~~Dump the live `brand.colors.surface`~~ — **skipped by owner decision ③**; the tenant is
      assumed to be on the default surface, which makes the migration value-neutral
- [x] Migration generated with `drizzle-kit generate --custom` (the change is jsonb *data*, so a
      schema diff emits nothing) → `0043_brand_colors_primary_accent.sql`, `when`
      `1787803283253` — newer than `0042_bumpy_greymalkin` (renumbered from 0042 on the
      2026-08-26 rebase, when #168 landed a 0042 of its own; drizzle-kit skips any entry
      older than the newest applied row, so the regenerate was mandatory, not cosmetic).
      **Check the live `__drizzle_migrations` table before applying**, not just `_journal.json`
- [x] The migration seeds `accent` from the tenant's `primary` and leaves the legacy `surface`
      key in place, unread. No column dropped, nothing deleted
- [x] Migration **not applied** — applying against the live Neon DB is the owner's call
- [x] `brand-icons.service.ts`: the icon plate's `colors.surface['0']` → literal white; the
      now-dead `colors` parameter dropped rather than left as a stale flag
- [x] `reports/helpers/report-email.helpers.ts`, `report-pdf.helpers.ts`,
      `quotations/helpers/quotation-email.helpers.ts`: brand surface lookups deleted, their
      neutral constants promoted to values and retuned to the fixed table's steps; helper
      signatures unchanged
- [x] Accent adopted per § Mechanics' table; each palette's misnamed `accent` key (it read
      `primary`) renamed `brandInk`; `PdfTheme` gains `accentFill` and `drawSectionHeader`
      uses it
- [x] `quotation-approval-page.helpers.ts` re-checked (primary-only — stayed green)
- [x] `GET /brand` no longer emits `surface` — `materializeBrand` projects `colors` to the
      two contract scales instead of passing the stored jsonb through
- [x] `test/brand.test.ts` updated, including a case proving the retired `primary` + `surface`
      payload is a 400 (written, not run — the suite hits live Neon)
- [x] `pnpm typecheck` green

### CP-2 — Superadmin palette layer (`feat(superadmin)`) — **done 2026-08-26**
- [x] `tailwind.config.js`: `primary` + `accent` through the existing `brandScale()` helper;
      `surface` rebuilt from § Target 3's literal table; header comment rewritten (it currently
      teaches `--brand-surface-*`)
- [x] Aliases per § Target 4 — `background` = `surface-100`, `dark` = `surface-800`,
      `accent` DEFAULT = `accent-500`; **`secondary` deleted**; the four legacy tombstones
      (`granite`/`sky`/`navy`/`cyan`) left exactly as they are
- [x] `app/theme/manttio-preset.ts`: primary keeps its vars, surface tokens become literals
      (`surface.0` stays `#FFFFFF`); **no invented accent tokens** — 23 CP-1 owns those
- [x] `services/theme/brand-theme.service.ts` sets `--brand-primary-*` + `--brand-accent-*` and
      stops emitting `--brand-surface-*` entirely (a dead var set re-invites theming)
- [x] `services/theme/color-scale.service.ts`: `deriveScale()` drops the `anchorZeroAtWhite`
      argument — surface was its only caller
- [x] `data/dtos/brand.ts` mirrors the new `BrandColors`
- [x] Brand editor: `surfaceBase`/`surfaceScale` → `accentBase`/`accentScale`, the second
      `app-scale-editor` relabelled **Acento** (`inputId="brand-accent"`), hydration reads
      `colors.accent`, `save()` sends `{ primary, accent }`, the preview slots show an accent
      surface
- [x] Editor copy states the new division of labor (two brand colors; the interface gray is
      fixed), and the fixed-status callout gains an accent swatch + its collision warning
- [x] `grep -rn "brand-surface\|colors\.surface\|surfaceScale\|surfaceBase" superadmin/src` → 0
- [x] No `secondary` color class survives anywhere in `superadmin/src`
- [x] `npm run build` green — and **every existing pixel unchanged**: this CP is vocabulary,
      not looks. Spot-check both modes

### CP-3 — Frontend leg (`style(frontend)` — absorbs 16 PR-1) — **done 2026-08-26**
- [x] Re-run the legacy inventory first (16's ~590 is a 2026-07-15 snapshot)
- [x] `tailwind.config.js` rewritten onto `primary` + `accent`; **no `surface` scale at all** —
      the chrome neutral is stock `zinc`, so the config defines nothing for it. Tombstones added
- [x] Mechanical sweep: `navy-N`/`sky-N`/`cyan-N` → `primary-N` (184), `granite-N` → `zinc-N`
      (520), word-boundary-safe, preserving variant prefixes and `/opacity` suffixes
      (`dark:hover:bg-sky-500`, `focus-visible:ring-sky-600/30`). Steps map **0 → 50** and
      **1000 → 950**, interior one-to-one — zinc ships exactly the 11 keys the brand model has,
      the same endpoint convention the PrimeNG preset already used
- [x] Sweep touched no lockfile, no `node_modules`, and no plan doc's historical text
- [x] Hand remap: the single `bg-surface` (old primary-tint alias) → `bg-primary-100`
- [x] `src/app/theme/brand-css.ts` emits primary + accent vars only
- [x] `src/app/theme/manttio-preset.ts`: zinc's hexes verbatim, `surface.0` white anchor kept
- [x] `bg-background` (= `zinc-50`) applied at 13 page shells. **`dark` retired** — it was
      defined but never used, and 16 § Target 4 is explicit that an alias has to be visible in
      real code; templates say `text-zinc-800` directly
- [x] `grep -rE '\b(granite|sky|navy|cyan)-[0-9]' frontend/src` → 0, and `surface-[0-9]` → 0
- [x] `npm run build` green; PWA theme color + generated manifest still brand-driven; dark mode
      spot-checked

### CP-4 — Website leg (`style(website)` — absorbs 16 PR-3) — **done 2026-08-26, reworked onto zinc 2026-08-27**
- [x] Re-run the inventory (~120 snapshot) — **174 found: granite 86, cyan 68, navy 9, sky 11**
- [x] `tailwind.config.mjs` rewritten, **plus the five aliases the site never had**
- [x] `src/lib/types.ts` `BrandColors` mirror updated; `src/lib/theme.ts` emits primary +
      accent only
- [x] Same mechanical sweep + tombstones
- [x] `grep -rE '\b(granite|sky|navy|cyan)-[0-9]' website/src` → 0
- [x] `npm run build` green; a published-CMS page spot-checked against the live brand
- [x] **Rework (owner, 2026-08-27):** the fixed `surface` scale deleted in favour of stock
      `zinc`, matching CP-3 — 85 instances swept (0 → 50, 1000 → 950, interior 1:1). The
      `surface` and `dark` aliases went with it (one template call between them); `background`
      (= `zinc-50`, the page ground) is the only alias left, so 16 § Target 4's alias set is
      deliberately not met here — recorded, not overlooked. `website/PLAN.md`'s palette table
      still taught `bg-navy-900` / `text-cyan-400`; rewritten onto primary + accent + zinc.

### CP-5 — Bookkeeping + docs (`docs`) — **done 2026-08-26** (bar the manager release)
- [x] Plan 16 header carries the full supersession (done at plan time — re-verified: nothing
      else still teaches the old pair)
- [x] `00-master-plan.md` table, progress board, and build-order rationale current
- [x] 01-conventions § Design language + `.claude/skills/superadmin-design` — **the palette half
      only**: `accent` is now a real scale, replacing the `primary-400` decorative-accent step.
      Which surfaces actually move onto it is left to 23 CP-1, which rewrites the rest
- [x] `frontend/CLAUDE.md` + `.claude/skills/field-app-design` — **moved into CP-3**, where
      they belong once the field app went to stock `zinc` (2026-08-27): those two docs are
      frontend-specific, and the plan-suite rule puts doc updates in the same commit as the
      code they describe. Editing them here as well would have shipped two contradictory
      versions of the same page. `superadmin/CLAUDE.md`, `website/CLAUDE.md` and root
      `CLAUDE.md` name no palette scales — nothing to change there
- [x] **Cross-app palette claims corrected (2026-08-27), after CP-3 and CP-4 went to zinc.**
      01-conventions and the `superadmin-design` skill both said the neutral was shared by all
      three apps; `superadmin/tailwind.config.js` said the same in a header comment. It is
      superadmin's alone now — neutral classes no longer port between the apps, only
      `primary-*`/`accent-*` do. § Per-app palette layer 1 was likewise still prescribing the
      fixed-table `surface` for every app; annotated as superadmin-only
- [x] `00-master-plan.md` said the brand migration was **0042** — it is **0043**
      (`0043_brand_colors_primary_accent.sql`; it was renumbered on the 2026-08-26 rebase when
      #168 landed a 0042 of its own, and plan 22 § CP-1 already recorded that). Row also now
      tracks what is merged vs. open rather than claiming CP-1…CP-4 all done
- [ ] **Manager-app coordination — open, and the one thing that can break a tenant.** The
      manager still pushes `colors.surface` and will take a 400 from `PUT /brand` the moment
      CP-1 deploys. It needs the two-picker editor and the `{ primary, accent }` payload,
      released in the same window

## Verification

- **Value-neutrality is the bar for CP-1…CP-4** — the only intended visual change is that a
  tenant who *customized* surface reverts to the fixed neutral. **Before migrating, dump the
  live `brand.colors.surface`** and diff it against the fixed table: identical → nothing moves;
  different → show the owner the delta and decide (adopt those values as the new fixed neutral,
  or accept the revert) *before* CP-1 ships.
- `grep -rn "colors\.surface\|--brand-surface\|brand-surface-" backend/src superadmin/src frontend/src website/src` → 0.
- Legacy-name greps per CP-3/CP-4 → 0; builds fail loudly on dead `@apply` classes.
- Dark mode spot-check in all three apps; PWA icon plate still renders white.

## Decisions

- **Locked (2026-08-26, owner):** tenant pair becomes **primary + accent**; `surface` survives
  as a **fixed neutral** scale (no `--brand-surface-*`, no editor control) · the change covers
  **all four packages in one suite**, absorbing 16's deferred frontend/website legs.
- **Derived (2026-08-26, planning):** fixed neutral = today's default surface (value-neutral) ·
  accent seeded from primary in the migration · legacy `surface` jsonb key tombstoned, not
  deleted · `secondary` alias retires in favor of `accent` · backend documents keep primary-only
  brand cues for now.
- **Answered (2026-08-26, owner):** ① **manager-app write compat — require `accent`
  immediately.** `saveBrandSchema` takes both scales, no optional phase: a manager still
  pushing `primary` + `surface` gets a 400 rather than a half-applied save, and the manager
  release is coordinated (§ Manager-app coordination). ② **Accent earns a role in the documents
  now** — one band per document, per the table in § Mechanics. ③ The pre-migration dump of the
  live `brand.colors.surface` is **skipped**: the tenant is assumed to be on the default
  surface, which makes the migration value-neutral. If that assumption is wrong, the visible
  consequence is a customized surface reverting to the fixed gray in the apps and documents —
  recoverable, because the migration leaves the legacy key in storage.
- **Amended (2026-08-27, owner) — the field app's neutral is stock `zinc`.** The `granite` →
  `surface` half of CP-3's sweep was 517 of its 701 instances, and once `surface` left the wire
  its whole justification ("utility name = wire name", 16 § Problem 2) went with it — unlike
  `sky`/`cyan`, `granite` shadows no stock Tailwind name, so there was no safety argument
  either. Rather than rename a bespoke neutral to a name that no longer means anything on the
  wire, the field app drops the scale and uses Tailwind's own. **This is not value-neutral:**
  zinc is faintly cool where the fixed neutral is pure gray, and its ramp runs deeper — the
  most-used step (`surface-700`, 107 hits) goes 36% → 26% lightness. Accepted as a deliberate
  look change, not a regression. **Extended to the website (2026-08-27, owner)** before CP-4
  merged: same argument, 85 instances, and the two public-facing surfaces would otherwise read
  as different grays. **Still open:** superadmin (~972 instances). It is on `surface-*` today
  and this plan does not move it — the argument applies there equally, but the sweep is an
  order of magnitude larger and plan 23 is authored on `surface-*`.
- **Derived (2026-08-26, CP-1):** `GET /brand` **projects** `colors` to `{ primary, accent }`
  instead of passing the jsonb through, so the tombstoned `surface` key never reaches a
  consumer and a deploy that lands ahead of the migration still serves a complete palette
  (absent `accent` mirrors the migration's rule and reads as `primary`).
