# Whitelabel 02 — Field-app runtime theming + PWA manifest (PR-B + PR-C)

> **Status:** planned · **Last updated:** 2026-07-11 · **PRs:** PR-B (theming), PR-C (manifest)
> **Part of:** `.claude/plans/field-app-whitelabeling/` (see `00-master` for the canonical
> Branding rules, shared brand contract, current reality, de-brand inventory).
> **Depends on:** `01-brand-backend` for a live `/brand` + `/fonts` (can build fail-soft before it lands).
> **Owner:** branch `feature/fullstack-whitelabel-branding`.

Make the field app (`frontend/`, Angular PWA) pull its identity from `/brand` at runtime and drop
its hardcoded brand. The website is **SSR** (injects `:root` vars server-side); the field app is a
**client PWA**, so "as website does" becomes: fetch at boot → apply CSS custom properties from JS.
The palette is byte-identical to the website's, so the mechanism ports directly (retargeted to
HSL / 0…1000 per the master's Branding rules).

## 1. Runtime theming (PR-B → CP-1)

### 1.1 Contract + service + state
- `src/app/data/dtos/brand/` — mirror the master's `Brand` + `FontCatalogEntry` types.
- `src/http/brand.service.ts` — `remote.get<Brand>('/brand')`, `remote.get<FontCatalogEntry[]>('/fonts')`
  (mirror `customers.service.ts`). Public endpoints; the auth interceptor attaching a JWT is harmless.
- `src/state/brand/` — mirror `src/state/app/`. `BrandStateModel { brand: Brand | null; fonts:
  FontCatalogEntry[]; loaded: boolean }`; `LoadBrand` as an **RxJS pipeline**
  (`from(...)`/`switchMap`/`tap`/`catchError`, no async). **Persist via the storage-plugin `keys`**
  (add `'brand'`) so the last brand paints instantly on the next boot (and offline); `LoadBrand`
  refreshes in the background. No flash after first run.

### 1.2 Boot + apply
- `app.config.ts` `provideAppInitializer`: dispatch `LoadBrand()` (fire-and-forget; the persisted
  brand already applied from cache, so bootstrap isn't blocked). Register `BrandState` in
  `provideStore([...])`.
- `app.ts` apply-`effect()` (extends the existing dark-mode effect): on `select(BrandState.brand)` →
  1. inject/replace `<style id="brand-vars">` with `:root { --brand-primary-0..1000;
     --brand-surface-0..1000; --brand-font-*; }` + any non-default `@font-face` — **port
     `website/src/lib/theme.ts::buildBrandCss`** into a pure `src/app/theme/brand-css.ts`,
     **emitting `H S% L%` components (not hex/RGB)**;
  2. `setAttribute` the favicon `<link>` href (`brand.isologoUrl`), apple-touch-icon,
     `apple-mobile-web-app-title` (`brand.name`), `theme-color` meta (brand primary — replaces the
     hardcoded `THEME_COLOR = { light:'#243345', dark:'#131717' }`; derive light/dark from the
     primary scale), and `document.title`;
  3. login logo `auth/pages/login/login.html` `assets/logo.jpg` → `[src]="brand.logoUrl"` (guarded;
     hide when absent).

### 1.3 Palette → CSS vars
- `tailwind.config.js`: rewrite `colors` to `hsl(var(--brand-<scale>-<step>, <neutralHslTriplet>) /
  <alpha-value>)` (the var holds `H S% L%`). **Steps become `0`…`1000` by 100** — remap endpoint
  utilities across templates + `styles.scss`/`theme/*.scss`: **`-50 → -0`, `-950 → -1000`** (interior
  `100`–`900` unchanged). Map `granite → surface`, `navy/sky/cyan → primary`; repoint semantic
  tokens (`background/surface/primary/secondary/dark`). Fallback = minimal neutral grayscale (rule
  3 — the real default palette comes from `/brand`). `@apply`-based global classes follow brand
  automatically — no per-class edits.
- PrimeNG `manttio-preset.ts`: swap the raw-hex `primary`/`surface` scales to
  `hsl(var(--brand-primary-<step>))` / `hsl(var(--brand-surface-<step>))` at steps `0`…`1000` (no
  `<alpha-value>` placeholder — PrimeNG tokens don't consume it). Verify dark mode still keys off
  `.app-dark`.

### 1.4 De-brand literals (removed here, once runtime replaces them)
`index.html` `apple-mobile-web-app-title`, the `_index.scss` comment, and the bundled `logo.jpg`
(→ `brand.logoUrl`, keeping a neutral bundled fallback).

## 2. PWA dynamic manifest (PR-C → CP-2)
The SW prefetches `manifest.webmanifest` + icons as statics; runtime JS can't swap them. So serve
the manifest **fresh at runtime**:
- **Manifest route:** a **Cloudflare Pages Function** on the frontend host
  (`frontend/functions/manifest.webmanifest.ts`, same-origin, `application/manifest+json`) that
  fetches `GET {API_BASE_URL}/brand` → a brand-driven manifest (`name`, `short_name`,
  `description`, `theme_color` from brand primary, `background_color`, `icons` from brand icon CDN
  URLs). Fail-soft to a neutral manifest if `/brand` is unavailable.
- **`index.html`:** `<link rel="manifest" href="/manifest.webmanifest">` now resolves to the function.
- **SW (`ngsw-config.json`):** **remove `/manifest.webmanifest` from the `app` prefetch group** so
  the SW doesn't pin a stale static manifest. Brand icons come from the CDN by URL; keep a neutral
  bundled fallback icon set for the no-brand path.
- **Caveat to document:** browsers cache the manifest; the installed-app identity refreshes on the
  next fetch, and an already-installed home-screen icon only updates on reinstall — an accepted
  limitation of any dynamic-manifest approach.

## Checkpoints
### CP-1 — Runtime theming (PR-B)
- [ ] `brand` DTO + `brand.service.ts` + `BrandState` (persisted) + boot `LoadBrand`
- [ ] `tailwind.config.js` + `manttio-preset.ts` CSS-var repoint (HSL, 0…1000; remap `-50/-950` →
      `-0/-1000`; neutral grayscale fallback; palette from `/brand`)
- [ ] `app.ts` apply effect (vars, favicon, theme-color, apple title, document title, login logo)
- [ ] Remove frontend brand literals (`index.html` apple title, `_index.scss` comment)
- [ ] Build green; light + dark correct; no-brand path renders the neutral default (no flash)

### CP-2 — Dynamic PWA manifest (PR-C)
- [ ] Pages Function `manifest.webmanifest` from `/brand`; `index.html` link; SW prefetch of the
      static manifest removed
- [ ] Neutral bundled fallback icon set; install shows tenant name/icon; document the cache caveat
- [ ] Static `manifest.webmanifest` brand literals gone (superseded by the route)

## Open decisions (this plan)
- **PWA icon assets:** the dynamic manifest needs sized + maskable icons (192/512) per tenant. Does
  the tenant upload a full icon set, or does the backend/build generate them from the uploaded
  isologo (needs image processing)? Today's `icons/*` are static Peña assets.
