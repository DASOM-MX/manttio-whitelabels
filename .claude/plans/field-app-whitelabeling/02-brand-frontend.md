# Whitelabel 02 — Field-app runtime theming + PWA manifest (PR-B + PR-C)

> **Status:** implemented — CP-1 (PR-B) + CP-2 (PR-C, backend-generated icons + `manttio-logos`
> bucket), 2026-07-12 · **Last updated:** 2026-07-12 · **PRs:** PR-B (theming), PR-C (manifest)
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
  3). `@apply`-based global classes follow brand automatically — no per-class edits.
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

## Checkpoints (CP-1 implemented 2026-07-12, PR-B)
### CP-1 — Runtime theming (PR-B)
- [x] `brand` DTO (`data/dtos/brand/`, mirrors the backend canonical incl. `siteUrl?`/`faviconUrl?`)
      + `http/brand.service.ts` + `state/brand/` (persisted via storage-plugin `brand` key;
      `LoadBrand` = forkJoin brand+fonts, per-leg `catchError` so a missing catalog never costs
      the brand) + boot dispatch in `provideAppInitializer`
- [x] `tailwind.config.js` + `manttio-preset.ts` CSS-var repoint (HSL, 0…1000; remap `-50/-950` →
      `-0/-1000` across 20 templates/sheets; neutral grayscale fallback; granite → surface,
      navy/sky/cyan → primary; Aura keeps its `50`/`950` keys aliased to brand steps `0`/`1000`,
      `surface.0` stays white to pair with the templates' `bg-white`); `frontend/CLAUDE.md`
      palette/dark-pairing docs updated
- [x] `app.ts` apply effect (ported `buildBrandCss` → `app/theme/brand-css.ts` — no default-code
      skip, the app bundles no catalog font; favicon/apple-touch-icon ← `faviconUrl ?? isologoUrl`;
      theme-color ← primary-800 / surface-1000 `hsl()` per mode; apple + document title ←
      `brand.name`); login logo ← `brand.logoUrl` (dark mode prefers `logoDarkUrl`), hidden when
      absent; bundled `assets/logo.jpg` deleted
- [x] Remove frontend brand literals (`index.html` apple title + `theme-color` hex → neutral,
      `_index.scss` comment; static `manifest.webmanifest` Peña literals stay for CP-2, which
      supersedes the file)
- [x] Build green; brand vars verified in the emitted CSS (fallback components + `<alpha-value>`
      modifiers intact, zero palette hexes); no-flash via persisted state; in-browser light/dark
      pass = user-run `ng serve` against the PR-A backend

### CP-2 — Dynamic PWA manifest (PR-C, implemented 2026-07-12)
- [x] Pages Function `frontend/functions/manifest.webmanifest.ts` builds the manifest from
      `GET {API_BASE_URL}/brand` per request (name/short_name/description; theme_color ←
      primary-800, background_color ← surface-0, both hex-converted; 5-min edge cache;
      fail-soft neutral manifest). `index.html` link unchanged (same path — the function
      outranks static assets); SW prefetch of the manifest removed from `ngsw-config.json`
- [x] **Icon set is backend-generated** (decided 2026-07-12): `brand/services/
      brand-icons.service.ts` decodes the PNG mark (`faviconKey ?? isologoKey`, `upng-js`),
      renders any-192/512 (transparent contain-fit) + maskable-192/512 (80% safe zone over a
      solid surface-0 tile), stores them in the **`manttio-logos` bucket** (new
      `MANTTIO_LOGOS` binding + `LOGOS_CDN_BASE_URL`; brand uploads moved to
      `POST /upload/logo`, keys prefix `logos/`, generated icons `icons/`), regenerates on
      every save (old objects best-effort deleted), and serves them as `brand.icons`
      (migration `0015`, applied). Undecodable/missing source fails soft — brand saves, icons
      absent
- [x] Neutral bundled fallback icon set (solid `#40454F` tiles replace the Peña marks in
      `public/icons/`); cache caveat documented in the function header; static
      `manifest.webmanifest` deleted (Peña literals gone)

## Open decisions (this plan)
- **PWA icon assets (resolved 2026-07-12):** the **backend generates** the sized + maskable set
  from the uploaded mark on every brand save and the manifest route injects the resulting CDN
  URLs (user decision). Pure-TS pipeline (`upng-js` codec + `brand/utils/rgba-image.ts`
  premultiplied bilinear resampler) — PNG sources only; anything else fails soft to the neutral
  bundled set.
- **Brand asset storage (decided 2026-07-12):** brand images + generated icons live in the
  dedicated **`manttio-logos`** bucket (second binding on the tenant Worker), uploaded via
  `POST /upload/logo` and materialized against `LOGOS_CDN_BASE_URL`; `manttio-reports` keeps
  report data only.
- **Deploy checklist (PR-C):** create the `manttio-logos` R2 bucket (dev + prod) and give it a
  public/custom domain; set the real `LOGOS_CDN_BASE_URL` in `wrangler.toml` (currently a
  placeholder `https://logos.penanevadachillers.com`); set the **Pages project env var
  `API_BASE_URL`** on the frontend project (the manifest function needs it); migration `0015`
  already applied to Neon (2026-07-12). Manager pushes now upload logos through
  `POST /upload/logo` (not `/upload/image`).
