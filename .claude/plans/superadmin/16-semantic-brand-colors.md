# 16 — Semantic brand color classes (`primary-*` / `surface-*`)

> **Status:** planned 2026-07-15 — **deferred by decision: this is the LAST plan of the suite.**
> Do not start until the MVP modules (08–15) have shipped; it then runs as the closing
> conventions sweep over everything that landed.
> **Scope decisions (2026-07-15, owner):** rename approved (convention > diff size) · keep all
> five single-value aliases, repointed honestly + normalized across the three apps · **three
> PRs, one per app** · sequenced last (also implies after PR #51 and every module PR merged).
> **References:** `.claude/plans/field-app-whitelabeling/00-master.md` → "Branding rules"
> (rules 2–3 still govern: HSL components, steps 0–1000, backend-provided palette, neutral-only
> fallbacks). Root `CLAUDE.md` → whitelabel de-branding rule.
> **Backend:** untouched — the wire contract (`/brand` `colors.primary` / `colors.surface`,
> `--brand-primary-*` / `--brand-surface-*` CSS vars) is already semantic. This plan makes the
> *Tailwind utility layer* speak the same language.

## Problem

The whitelabel suite kept the legacy manttio palette *names* as Tailwind classes and aliased
them onto the brand CSS vars. Three problems, worst first:

1. **`sky` and `cyan` are default Tailwind palette names.** Our configs shadow them via
   `theme.extend.colors` — which *merges* with the default theme. A dev reading `bg-sky-600`
   reasonably assumes stock Tailwind blue; worse, if an override is ever dropped or renamed,
   stragglers silently fall back to the **stock** palette instead of failing — an off-brand
   regression with no build error. The longer the MVP grows on these names, the bigger that
   surface gets.
2. **Class names don't match the contract.** Wire + CSS vars + PrimeNG presets all say
   `primary`/`surface`; templates say `sky`/`granite`/`navy`/`cyan`. Devs must carry a mapping
   table in their head — and it differs per app (frontend anchors `navy`, superadmin `sky`,
   website defines all three).
3. **Drift already happened** (found 2026-07-15): superadmin's `navy` and `cyan` are *hardcoded
   manttio hexes* on the old 50–950 steps — used by
   `model/constants/user/role-pill-classes.const.ts`. Nuance: the role pills being a **static
   blue ladder is deliberate** (14 §1, QA 2026-07-08 — one ladder, darker = higher rank, not
   brand-shifting); the drift is that the ladder rides *palette keys* this plan tombstones,
   keys that mean "brand primary" in the other two apps.

## Target convention (canonical)

1. **Exactly two Tailwind color scales per app:** `primary` and `surface`, steps `0…1000` by
   100, each step `hsl(var(--brand-<scale>-<step>, <neutral fallback>) / <alpha-value>)`.
   Utility name = scale name = wire name: `bg-primary-600`, `text-surface-1000`,
   `dark:bg-surface-800`.
2. **Legacy names are tombstoned, not deleted.** Configs keep `granite: {}`, `sky: {}`,
   `navy: {}`, `cyan: {}` (empty objects + a comment). Because `extend` merges with the default
   theme, plain deletion would resurrect stock `sky`/`cyan` and make stragglers render stock
   blue silently; the tombstones keep every legacy class dead (no CSS emitted) while grep +
   build verification prove zero stragglers.
3. **Single-value semantic aliases: kept, honest, identical in all three apps** (frontend and
   superadmin have them today with misleading values; website has none):

   | Alias | Value | Role |
   |---|---|---|
   | `background` | `surface-0` | page background |
   | `surface` (DEFAULT of the scale) | `surface-100` | card/panel background |
   | `primary` (DEFAULT of the scale) | `primary-600` | brand anchor (buttons, links, focus) |
   | `secondary` | `primary-300` | soft/secondary accent |
   | `dark` | `surface-800` | body text |

   ⚠️ **Meaning change:** today `surface` = *primary*-100 (a primary tint) in
   frontend/superadmin — dishonest under semantic naming. New `surface` DEFAULT is the neutral
   panel tint; the one real usage of the old alias (frontend, 1 hit) migrates to an explicit
   `bg-primary-100`.
4. **Aliases must be visibly used, not just defined** (owner note 2026-07-15: "superadmin
   doesn't actually set bg and dark — add these or show them if inferred"): each app's shell
   applies `bg-background` for the page background and `text-dark` for base text where those
   roles are currently expressed as raw scale classes or inherited styles, so devs see the
   aliases in real use.

## Current reality (inventory, 2026-07-15)

Class-instance counts across `src/` (`.html`/`.ts`/`.scss`/`.astro`):

| App | `granite` | `sky` | `navy` | `cyan` | aliases in use | Config today |
|---|---|---|---|---|---|---|
| `frontend/` | 423 | 144 | 13 | 0 | `bg-background` ×11 · `bg-surface` ×1 | `granite`→surface · `navy`→primary · `sky: navy` · `cyan: navy` · 5 aliases |
| `superadmin/` | 836 | 194 | 1 | 6 | `bg-background` ×5 | `granite`→surface · `sky`→primary · **`navy`/`cyan` hardcoded 50–950 hex** · 5 aliases |
| `website/` | 49 | 11 | 9 | 49 | — | `granite`→surface · `navy`/`sky`/`cyan`→primary · no aliases |

Verified out of scope / safe:

- **PrimeNG presets** (`frontend/src/app/theme/manttio-preset.ts`,
  `superadmin/src/app/theme/manttio-preset.ts`) already read `--brand-primary-*` /
  `--brand-surface-*` directly — no palette-name references, no rename needed.
- **No dynamic class composition** — repo-wide grep for template-literal class building on the
  four names returns nothing; the sweep is fully static.
- **Brand editor / ColorScaleService / DTOs** already speak `primary`/`surface` (wire names).
- Counts above are a 2026-07-15 snapshot — modules 08–15 will grow them. **Re-run the
  inventory when this plan starts;** the recipe doesn't change, only the diff size.

## Mechanics (same recipe per app)

1. **Config rewrite:** define `primary` + `surface` via the existing `brandScale()` helper
   (mechanical rename — fallbacks, steps, and `<alpha-value>` plumbing stay byte-identical);
   nest the `DEFAULT` alias values; keep `background`/`secondary`/`dark` as top-level aliases;
   tombstone the four legacy names to `{}` with a comment explaining why they must stay.
2. **Mechanical sweep** over `src/`: `navy-N`/`sky-N`/`cyan-N` → `primary-N`;
   `granite-N` → `surface-N`. Word-boundary-safe substitution that preserves variant prefixes
   and opacity suffixes (`dark:hover:bg-sky-500`, `focus-visible:ring-sky-600/30`). Review the
   diff — the sweep must not touch `node_modules`, lockfiles, or plan docs' historical text.
3. **Hand remaps (not sed-able):**
   - superadmin `role-pill-classes.const.ts`: the tombstones kill its `navy`/`cyan` classes, so
     the pills need a resolution (implementation-time design pass): **(a) stay static** per
     14 §1's QA decision — move the blue ladder to self-contained literal values (a dedicated
     non-brand color key or inline styles in the const), or **(b) go on-brand** — map to
     `primary`/`surface` steps and re-eyeball contrast per role in both modes. Default to (a)
     unless the owner opts into (b);
   - frontend's single `bg-surface` (old primary-tint alias) → `bg-primary-100`;
   - apply `bg-background` / `text-dark` at each app shell (§ Target 4).
4. **Docs in the same PR:** update the palette-mapping comments in each `tailwind.config.*`,
   and each package `CLAUDE.md` (+ root `CLAUDE.md` if it mentions the old names) so no doc
   still teaches `sky`/`granite`.
5. **Verification per app:**
   - build green (`@apply` on a dead class fails loudly — scss stragglers can't hide);
   - `grep -rE '\b(granite|sky|navy|cyan)-[0-9]' <app>/src` → **zero**;
   - headless smoke against the live brand: the rename is **value-neutral** — every rendered
     color must be pixel-identical (role pills included under option (a); only under (b) do
     they intentionally change); spot-check dark mode.

## PR map

| PR | Prefix | Contents |
|---|---|---|
| PR-1 | `style(frontend)` | config + sweep (~590 instances) + alias application |
| PR-2 | `style(superadmin)` | config + sweep (~1040) + role-pill resolution (§ Mechanics 3) + alias application |
| PR-3 | `style(website)` | config + sweep (~120) + aliases added |

Independent, any order, each independently deployable. All three land **after the MVP suite is
complete** — this plan closes the suite.

## Decisions

- **Locked (2026-07-15):** rename to semantic names approved · keep all five aliases,
  repointed + normalized + visibly applied · three PRs, one per app · deferred to run as the
  suite's final plan · tombstone (never plain-delete) the legacy names.
- **Open (implementation-time):** role pills — static ladder (default, per 14 §1) vs on-brand
  (§ Mechanics 3) · re-run the inventory snapshot before starting.
