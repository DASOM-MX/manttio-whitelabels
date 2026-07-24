# 17 — Executive refresh: clean, breathable UI on stock PrimeNG ("soft-executive")

> **Status:** done 2026-07-22 (all five CPs shipped) — **CP-1 done 2026-07-22** (PR #89, branch
> `feature/superadmin-executive-refresh-cp1`, stacked on #88; built in the
> `executive-refresh-cp1` worktree for fast rollback) · **CP-2 done 2026-07-22**
> (branch `feature/superadmin-executive-refresh-cp2`, stacked on CP-1: shared
> `page-header` component swept across all 17 routed pages, shell gutters
> `px-4 sm:px-6 md:px-8` + `py-6`, topbar/sidebar strips to `h-16`; nav restyled
> **Diamond-flat** on owner direction the same day, then to the reference's
> **dark brand panel** (sidebar `primary-1000` both modes, rounded right edge +
> `primary-800/50` hairline, light-on-dark rows, solid `primary-600` active row —
> supersedes the pill nav, its icon chips, and the 2026-07-21 hand-tuned pill
> spacing); breadcrumbs stayed off pending owner eyeball) · **CP-3 done 2026-07-22**
> (branch `feature/superadmin-executive-refresh-cp3`, stacked on CP-2: all five list
> pages — skeleton `#loadingbody` rows + `[showLoader]="false"` replace the spinner
> overlay (`.skeleton` bar + reduced-motion-guarded pulse), `.empty-icon` disc empties,
> `.row-action`/`--danger`/`--success` extract the five inline icon-action copies,
> equipment gains `rowHover` + canon whole-row click, templates' "Abrir" text link →
> standard eye icon action) · **CP-4 done 2026-07-22** (branch
> `style/superadmin-executive-refresh-cp4`, stacked on the CRM-dashboard branch:
> form-language extraction into `styles.scss` globals — `.field-error`/`.field-hint`,
> `.link-action`, `.callout` + variants, `.seg-tabs`/`.seg-tab`, `.field-shell`,
> `.row-action` widened to editor repeaters/toolbars (+`--grab`, disabled dim) —
> inline validation errors on every scalar editor field (touched-gated,
> `role="alert"`; repeater rows keep Aura's `ng-invalid.ng-dirty` border),
> composite controls (tags-input, rich-text, icon-picker, scale-editor, template
> columns toggle) onto the soft branded outline + `h-11 sm:h-10` baseline, dialog
> widths → `dialog-sm/md/lg` styleClass steps in `overlays.scss` (inline `[style]`
> width exception retired), clients-editor drawer `drawer-form` (bracket utility
> gone) + CP-3 skeleton rows, home-editor tabs framed in their `.card`; weight-
> ladder + caps-law sweep on all form/overlay surfaces) · **CP-5 done 2026-07-22**
> (branch `style/superadmin-executive-refresh-cp5`, stacked on CP-4: client 360 +
> equipment/report detail views onto the shared idioms — blacklist banner →
> `callout--danger`, quick-contact circles / make-default / detach / copy ghosts →
> `.row-action`, entity links → `.link-action`, detail-page centered spinners →
> shape-mirroring `.skeleton` cards (spinners stay buttons-only per 01); the
> app-wide sweep retired the last arbitrary bracket values (notification badge +
> body text, share-links popover width), swept weight-ladder stragglers to 500 —
> surviving 600+ is all sanctioned: wordmarks, the CRM KPI hero numerals (rare
> emphasis), the brand-editor type preview — slimmed the equipment dropzones to
> the hairline dashed border, and deleted the never-adopted `.icon-chip--soft`;
> the dashboard leg had landed early, see below). **Plan complete.**
> **Post-CP-2 owner turns (2026-07-22, same worktree):** inputs → **soft branded
> outline** (primary-600/40 rest → solid 600 hover → 700 + halo focus; third
> revision that day — see 01 §Design language) after the CSS-layer root cause
> (PrimeNG's injected `cssLayer.order` establishes layer order, not styles.scss —
> preflight had been stripping ALL Aura borders since the app's start) ·
> buttons → **default-PrimeNG shape** ("blob-like buttons do not look clean"):
> `.btn` family + paginator pages `rounded-control`/`px-4`, `<p-button>` token
> `{border.radius.lg}` — **supersedes decision ② as far as the pill `.btn`
> family goes**; the rest of ② (shadow-cards, `rounded-card`, glass popovers)
> stands. Chrome icon-circles (topbar) stay round. Runs before modules
> 09/10/12/13 start (deliberate mid-suite insertion so the remaining modules are
> authored in the refreshed language, not restyled later).
> **CRM dashboard pulled forward from CP-5 (owner 2026-07-22, "one of our main
> selling points"):** the "CRM cockpit" redesign shipped as its own stacked
> fullstack branch `feature/fullstack-crm-dashboard-refresh` (on CP-3) — KPI strip
> (incl. new Conversión + Seguimientos vencidos), six-month trend line with the
> sanctioned `primary-400` area fill, follow-up agenda, channel-mix bars replacing
> the two pies, activity full-width with Autor; two new backend reads
> (`/customers/stats/trend`, `/customers/follow-ups`). Full spec + supersession
> trail in utm-params 03; CP-5's dashboard leg is therefore done early — its
> remaining scope is client 360 + detail views + the app-wide sweep.
> **Owner:** planning session 2026-07-22 · **Last updated:** 2026-07-22
> **CP-1 disposition confirmations (2026-07-22):** 13 sheets deleted (the 8 form
> sheets + `button`/`dialog`/`drawer`/`toast`; `tabs` slimmed to integration-only) —
> their non-chrome content consolidated into two new thin sheets: **`forms.scss`**
> (responsive control baseline — no Aura token is breakpoint-aware) and
> **`overlays.scss`** (select/multiselect/datepicker first-paint anchoring).
> **`tag.scss` kept** (departure from the default-delete verdict: the pill shape +
> soft-bg/ring severity ladder IS the status-pill cue; stock Aura's tag is a plain
> badge). `table.scss`/`popover.scss` kept as planned. `<p-button>` turned out
> unused (all buttons are native `.btn-*`) — the pill button token is future-proofing.
> **Owner decisions (2026-07-22, all locked):** ① **preset-first** component styling —
> stock Aura chrome through `ManttioPreset` design tokens, override sheets retired ·
> ② **soft-executive hybrid** — #88's personality (floating `shadow-card` cards,
> `rounded-2xl`, pill `.btn` family, blended nav, glass popovers) survives; Diamond's
> breathing room, page structure, and stock component internals arrive around it ·
> ③ typeface → **Figtree** (self-hosted `@fontsource-variable/figtree`).
> **References:** PrimeNG **Diamond** template (`diamond.primeng.org` — e.g. the invoice
> page) for structure, spacing, and "stock components done well"; Chakra UI + Ant Design
> as secondary cleanliness references. The **field-app-derived high-contrast/density
> heritage is explicitly dropped** — superadmin serves office/executive users, not
> sunlight-and-gloves field techs. (WCAG contrast minimums are NOT what's being dropped —
> those stay CRITICAL per 01-conventions.)

## Problem

1. **"Default PrimeNG" is currently 16 hand-built sheets.** `src/theme/*.scss` rebuilds
   every component's chrome in Tailwind `@apply` — high-maintenance, every new PrimeNG
   component needs a new sheet, and "looks like ours" drifts from "is stock" over time.
   Meanwhile `manttio-preset.ts` (the sanctioned theming channel, already brand-wired to
   `--brand-primary/surface-*`) customizes *only colors* — the design-token surface Aura
   actually offers (radii, paddings, focus ring, per-component tokens) sits unused.
2. **The language grew out of the field app.** The original "solid & tight operations
   console" framing (density, hard contrast, micro-chrome) was inherited from the
   field product's constraints. The owner wants clean, breathable, easy — this app is
   used by a range of people and must read executive, not industrial.
3. **#88 established personality but not a system.** The soft-UI pass covered shell +
   lists; forms, editors, dialogs, detail views, and the dashboard still mix eras.
   Modules 09 (billing), 10 (wms), 12 (calendar), 13 (contracts) are unbuilt — every
   surface shipped after this plan should be born consistent, not swept later.

## Direction (canonical) — "soft-executive"

The look: **stock Aura components, breathing room, and a calm executive rhythm — carried
on #88's soft personality.** White `rounded-2xl` cards floating on the `surface-100` page
background with neutral `shadow-card`; pill actions; Figtree; generous page-level
whitespace *around* data that stays honest and compact *inside* its cards.

1. **Preset-first styling authority.** Component chrome is expressed through
   `ManttioPreset` design tokens (semantic + per-component), not override sheets. A
   sheet survives only where (a) no token exists for the need, or (b) the need is
   layout-integration, not chrome (table density, glass popover surface). The
   `cssLayer: primeng` setup stays — surviving sheets win unlayered, no `!important`.
2. **Shape boundary (unchanged from #88):** cards `rounded-2xl` · buttons/nav pills
   `rounded-full` · inputs `rounded-lg` · icon chips `rounded-xl`. Overlays (dialogs,
   drawers) adopt stock Aura chrome and rhythm; popovers keep the owner-exception
   liquid-glass surface (popovers only, neutral shadow, no glow — unchanged).
3. **Typography = Figtree** (variable, self-hosted; supersedes Nunito Sans 2026-07-22 —
   third and final face change of the redesign arc). Weights: 400 body · 500
   labels/buttons · 600–700 headings. `font-data` numeric stack (Atkinson Hyperlegible,
   `tnum`) unchanged. Never a CDN font.
4. **Breathable rhythm (Diamond reference), tunable on-screen at each CP:** cards step
   up to `p-6`; section gaps `gap-5`/`gap-6`; page gutters `px-6 md:px-8`; a consistent
   page-header block (see 5) with real margin under it (`mb-6`). Controls keep the
   just-tuned `h-11 sm:h-10` baseline; table cells stay compact (`py-2.5`, 13–14px) —
   **airy chrome, dense data** remains the rule; the air moves to the page level.
5. **Page-header pattern (new, every routed page):** one `h1` (`text-xl`/`2xl`,
   semibold) + optional one-line description in muted text + the page's primary actions
   aligned right (filters popover trigger stays left of the primary action). Default is
   **title-only — no breadcrumbs** (nav is two levels deep; a breadcrumb would restate
   the sidebar); owner may opt in at CP-2 after seeing it.
6. **Full-width main stays** (owner directive 2026-07-21 — "as much space as possible
   from the main container"). Breathing room comes from gutters and rhythm, not a boxed
   max-width canvas.
7. **What "dropping the field-app heritage" means concretely:** no uppercase/caps
   tracking anywhere (already law), softer muted-text steps where WCAG allows, no
   micro-chrome for its own sake, skeletons over spinners, and never sacrificing
   scannability to density. All 01-conventions Accessibility (CRITICAL) rules unchanged:
   4.5:1 text contrast, focus rings, labels, keyboard paths.
8. **Dark mode ships in the same commit as light, every CP** — `.app-dark` stays the
   single selector (Tailwind + PrimeNG preset both read it); stock Aura dark tokens
   already flow from the preset's `colorScheme` surfaces.

## Mechanics — the preset-first migration

1. **Expand `ManttioPreset`:** keep the existing `primary`/`surface` brand wiring
   byte-identical; add semantic tokens for form-field chrome (padding, `rounded-lg`
   radius, focus ring = the current `.field-input` focus language) and per-component
   tokens where a shape decision lives (e.g. button `borderRadius` → pill). Rule of
   thumb: **a value we'd have put in a sheet goes in a token if Aura exposes one.**
2. **Sheet disposition** (verdicts confirmed on-screen at CP-1; defaults below):

   | Sheet | Default verdict | Why |
   |---|---|---|
   | `inputtext`, `password`, `textarea`, `inputnumber`, `select`, `multiselect`, `datepicker`, `checkbox` | **delete** | stock Aura + form-field tokens carry the baseline; `.field-input` (styles.scss) remains for raw non-PrimeNG inputs, redefined to visually match stock |
   | `button` | **delete** | pill shape via button tokens; severities via semantic colors already wired |
   | `tag`, `tabs`, `dialog`, `drawer`, `toast` | **delete** | stock Aura chrome fits the hybrid; status/role pills are our own classes, unaffected |
   | `table` | **keep (thin)** | density + borderless shadow-card surface + pill paginator are layout-integration, not chrome |
   | `popover` | **keep (thin)** | liquid-glass owner exception lives here |

3. **`styles.scss` recon:** `.btn` family, `.card`/`.card-section`, `.icon-chip`,
   `.micro-label`, `.section-heading`, role pills, shell chrome all survive (they're
   ours, not PrimeNG's) — re-rhythmed to §Direction 4. `.field-input` shrinks to "match
   stock" duty. Font imports swap Nunito Sans → Figtree (uninstall/install the
   fontsource packages; Tailwind `fontFamily.sans` repointed).
4. **Docs in the same commit, every CP:** `01-conventions.md` + the `superadmin-design`
   skill are rewritten as the refresh lands (the "solid & tight" identity becomes
   "soft-executive"; Density/Surfaces/Typography sections get dated supersession
   trails). `superadmin/CLAUDE.md` quick-rules updated where they teach retired idioms.

## Scope inventory (shipped surfaces to re-pass)

Shell/layouts · dashboard (crm) · branding editor · CMS editors (home/clients) · users
(list/form/detail) · reports (browser/detail/template builder) · clients directory
(+leads/blacklist/archived presets, client 360) · CRM surfaces (timeline, status/interaction
dialogs) · equipment (list/detail) · auth screens · shared widgets (filters popover,
delete dialogs, toasts, empty states). Modules 09/10/12/13 are **out of scope** — they
inherit the language by being built after it.

## Checkpoints (stacked PRs, one per CP — house granularity rule)

| CP | PR | Contents |
|---|---|---|
| CP-1 | `style(superadmin)` foundation | Figtree swap · preset token expansion · sheet retirement per disposition table · `.field-input`/`.btn`/`.card` re-rhythm · docs rewrite. **Gate:** build green + all-pages visual smoke light/dark — stock chrome must not regress any form. |
| CP-2 | `style(superadmin)` shell + page headers | Page-header pattern applied to every routed page · shell rhythm (gutters, topbar spacing) · nav polish to the new rhythm. Owner eyeballs breadcrumb opt-in here. |
| CP-3 | `style(superadmin)` lists | All list pages: header block, toolbar consistency, table breathing, empty/skeleton states. |
| CP-4 | `style(superadmin)` forms + overlays | Editors (users/brand/CMS/templates), all dialogs/drawers/toasts on stock chrome, form rhythm + validation states. |
| CP-5 | `style(superadmin)` dashboard + details + sweep | Dashboard, client 360, equipment/report detail views; final app-wide consistency sweep (grep for retired idioms, dead classes). |

Each CP: `npm run build` green, e2e (`e2e/`) green, checkboxes + status header updated
in the same commit, no screenshots unless asked (owner watches :4200).

## Verification

- Build green per CP (`@apply` on dead classes fails loudly — retired-sheet stragglers
  can't hide).
- `grep -r 'nunito' superadmin/src superadmin/package.json` → zero after CP-1.
- Visual smoke per CP in **both modes** against the live brand; stock-chrome adoption is
  allowed to *change* pixels (unlike plan 16) — what it must not change is behavior,
  a11y, or brand-var wiring.
- Filters-popover, dirty-guard, and list-URL-param behaviors untouched (this plan is
  visual/structural only — zero state/logic changes).

## Decisions

- **Locked (2026-07-22, owner):** preset-first architecture · soft-executive hybrid
  (#88 personality survives) · Figtree · runs immediately after #88 merges, before
  09/10/12/13 · full-width main stays · glass stays popovers-only · WCAG rules
  untouched · five stacked CP PRs.
- **Open (implementation-time):** per-sheet disposition confirmations at CP-1 ·
  breadcrumb opt-in at CP-2 (default: title-only) · exact spacing values are on-screen
  tunable within §Direction 4's rhythm (owner hand-tunes are canon once made).
