# 22 — Brand palette: **primary + accent** (surface goes fixed-neutral)

> **Status:** in progress 2026-08-26 — **CP-1 done**, CP-2…CP-5 open
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
2. **`surface` stays a Tailwind scale in all three apps and in the PrimeNG presets** — same
   utility names, same 11 steps, same `<alpha-value>` plumbing — but its values are **literal
   HSL components**, not `hsl(var(--brand-surface-N, …))`. No sweep of the ~972 superadmin
   `surface-*` instances: they keep working and keep meaning "chrome neutral".
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
2. PrimeNG preset: `primary` reads `--brand-primary-*` (unchanged), `surface` reads the fixed
   literals, `accent` is exposed only where Aura has a slot for it (do **not** invent
   semantic tokens the components ignore — plan 23 CP-1 owns any real accent tokens).
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

### CP-2 — Superadmin palette layer (`feat(superadmin)`)
- [ ] `tailwind.config.js`: `primary` + `accent` through the existing `brandScale()` helper;
      `surface` rebuilt from § Target 3's literal table; header comment rewritten (it currently
      teaches `--brand-surface-*`)
- [ ] Aliases per § Target 4 — `background` = `surface-100`, `dark` = `surface-800`,
      `accent` DEFAULT = `accent-500`; **`secondary` deleted**; the four legacy tombstones
      (`granite`/`sky`/`navy`/`cyan`) left exactly as they are
- [ ] `app/theme/manttio-preset.ts`: primary keeps its vars, surface tokens become literals
      (`surface.0` stays `#FFFFFF`); **no invented accent tokens** — 23 CP-1 owns those
- [ ] `services/theme/brand-theme.service.ts` sets `--brand-primary-*` + `--brand-accent-*` and
      stops emitting `--brand-surface-*` entirely (a dead var set re-invites theming)
- [ ] `services/theme/color-scale.service.ts`: `deriveScale()` drops the `anchorZeroAtWhite`
      argument — surface was its only caller
- [ ] `data/dtos/brand.ts` mirrors the new `BrandColors`
- [ ] Brand editor: `surfaceBase`/`surfaceScale` → `accentBase`/`accentScale`, the second
      `app-scale-editor` relabelled **Acento** (`inputId="brand-accent"`), hydration reads
      `colors.accent`, `save()` sends `{ primary, accent }`, the preview slots show an accent
      surface
- [ ] Editor copy states the new division of labor (two brand colors; the interface gray is
      fixed), and the fixed-status callout gains an accent swatch + its collision warning
- [ ] `grep -rn "brand-surface\|colors\.surface\|surfaceScale\|surfaceBase" superadmin/src` → 0
- [ ] No `secondary` color class survives anywhere in `superadmin/src`
- [ ] `npm run build` green — and **every existing pixel unchanged**: this CP is vocabulary,
      not looks. Spot-check both modes

### CP-3 — Frontend leg (`style(frontend)` — absorbs 16 PR-1)
- [ ] Re-run the legacy inventory first (16's ~590 is a 2026-07-15 snapshot)
- [ ] `tailwind.config.js` rewritten onto `primary` + `accent` + fixed `surface` + the five
      aliases, tombstones added
- [ ] Mechanical sweep: `navy-N`/`sky-N`/`cyan-N` → `primary-N`, `granite-N` → `surface-N`,
      word-boundary-safe, preserving variant prefixes and `/opacity` suffixes
      (`dark:hover:bg-sky-500`, `focus-visible:ring-sky-600/30`)
- [ ] Sweep touched no lockfile, no `node_modules`, and no plan doc's historical text
- [ ] Hand remap: the single `bg-surface` (old primary-tint alias) → `bg-primary-100`
- [ ] `src/app/theme/brand-css.ts` emits primary + accent vars only
- [ ] `src/app/theme/manttio-preset.ts`: surface literals, `surface.0` white anchor kept
- [ ] Aliases visibly applied at the shell — `bg-background` + `text-dark` (16 § Target 4)
- [ ] `grep -rE '\b(granite|sky|navy|cyan)-[0-9]' frontend/src` → 0
- [ ] `npm run build` green; PWA theme color + generated manifest still brand-driven; dark mode
      spot-checked

### CP-4 — Website leg (`style(website)` — absorbs 16 PR-3)
- [ ] Re-run the inventory (~120 snapshot)
- [ ] `tailwind.config.mjs` rewritten, **plus the five aliases the site never had**
- [ ] `src/lib/types.ts` `BrandColors` mirror updated; `src/lib/theme.ts` emits primary +
      accent only
- [ ] Same mechanical sweep + tombstones
- [ ] `grep -rE '\b(granite|sky|navy|cyan)-[0-9]' website/src` → 0
- [ ] `npm run build` green; a published-CMS page spot-checked against the live brand

### CP-5 — Bookkeeping + docs (`docs`)
- [ ] Plan 16 header carries the full supersession (done at plan time — re-verify nothing else
      still teaches the old pair)
- [ ] `00-master-plan.md` table, progress board, and build-order rationale current
- [ ] 01-conventions § Design language + `.claude/skills/superadmin-design` — **the palette half
      only**: `accent` replaces the `primary-400` decorative-accent step (same commit, 01's
      standing rule). 23 CP-1 rewrites the rest of that section
- [ ] Each package `CLAUDE.md` (+ root `CLAUDE.md`) wherever it names the old pair
- [ ] Manager-app coordination closed out: the manager ships its two-picker editor and the
      `{ primary, accent }` payload

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
- **Derived (2026-08-26, CP-1):** `GET /brand` **projects** `colors` to `{ primary, accent }`
  instead of passing the jsonb through, so the tombstoned `surface` key never reaches a
  consumer and a deploy that lands ahead of the migration still serves a complete palette
  (absent `accent` mirrors the migration's rule and reads as `primary`).
