/**
 * Superadmin Tailwind config — semantic brand scales (plan 16).
 *
 * Whitelabel (02-app-shell.md §5): the `primary` and `surface` scales resolve
 * through CSS variables so the boot-time `GET /brand` fetch (module 03) can
 * re-theme the app at runtime — the `BrandThemeService` sets
 * `--brand-primary-*` / `--brand-surface-*` on `:root`. Values are HSL
 * components ("H S% L%") at steps 0…1000 by 100 (branding rule 2). Fallbacks
 * are a minimal neutral grayscale for the no-brand instant only — the real
 * default palette comes from the backend (rule 3).
 *
 * Utility name = scale name = wire name (`bg-primary-600`,
 * `dark:bg-surface-800`) — no mapping table to carry in your head.
 */

const NEUTRAL_L_BY_STEP = {
  0: 98,
  100: 96,
  200: 90,
  300: 82,
  400: 70,
  500: 55,
  600: 45,
  700: 36,
  800: 28,
  900: 18,
  1000: 10,
};

const neutralScale = (hue, saturation) =>
  Object.fromEntries(
    Object.entries(NEUTRAL_L_BY_STEP).map(([step, l]) => [step, `${hue} ${saturation}% ${l}%`]),
  );

/** Build a Tailwind color scale that reads `--brand-<name>-<step>` with a
 *  neutral HSL-components fallback, keeping `<alpha-value>` support. */
const brandScale = (name, fallbacks) =>
  Object.fromEntries(
    Object.entries(fallbacks).map(([step, hsl]) => [
      step,
      `hsl(var(--brand-${name}-${step}, ${hsl}) / <alpha-value>)`,
    ]),
  );

// A whisper of blue on primary so interactive chrome still reads as such;
// surface is pure grayscale (mirrors the backend's neutral default brand).
const surface = brandScale('surface', neutralScale(0, 0));
const primary = brandScale('primary', neutralScale(220, 10));

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  // Use a custom `.app-dark` class instead of the default `.dark`, so it lines
  // up with PrimeNG's `darkModeSelector` and we toggle a single class on `<html>`.
  darkMode: ['class', '.app-dark'],
  theme: {
    extend: {
      colors: {
        // The two brand scales + single-value semantic aliases (plan 16 §Target):
        // identical across frontend / superadmin / website.
        primary: { ...primary, DEFAULT: primary['600'] }, // brand anchor (buttons, links, focus)
        surface: { ...surface, DEFAULT: surface['100'] }, // card/panel tint
        // Page bg sits one step under the card whites so the soft-UI
        // elevation actually reads (owner 2026-07-22) — a deliberate
        // superadmin-only divergence from the shared surface-0 value
        // (plan 16 §Target 3 note).
        background: surface['100'],
        secondary: primary['300'], // soft/secondary accent
        dark: surface['800'], // body text

        // Tombstones (plan 16 §Target 2) — the legacy palette names must stay
        // as empty objects, NOT be deleted: `theme.extend` merges with the
        // default theme, and `sky`/`cyan` are stock Tailwind names, so plain
        // deletion would silently resurrect stock blue for any straggler
        // class. Empty objects keep every legacy utility dead (no CSS
        // emitted) while grep + build verification prove zero stragglers.
        granite: {},
        sky: {},
        navy: {},
        cyan: {},
      },

      fontFamily: {
        // Figtree is the superadmin's own voice (01-conventions Typography;
        // owner 2026-07-22, plan 17 — supersedes Nunito Sans, which superseded
        // Quicksand/Commissioner) — constant across tenants, a deliberate
        // deviation from frontend parity.
        sans: ['"Figtree Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Numeric/data stack: Atkinson Hyperlegible heads it (verified
        // tabular digits — 01 Typography fallback, 2026-07-06); the product
        // voice only backs it up for non-digit glyphs.
        data: [
          '"Atkinson Hyperlegible"',
          '"Figtree Variable"',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },

      fontSize: {
        // Micro-labels (01 Design language): 11px card/table headers.
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },

      // Semantic radius tokens (owner 2026-07-22): the shape boundary as
      // utilities — `rounded-card` for cards/panels/dialogs/table shells
      // (and the sidebar's `rounded-r-card` edge), `rounded-chip` for icon
      // chips + popovers, `rounded-control` for inputs/nav rows. Pills stay
      // `rounded-full`. New chrome uses these, never raw rounded-lg/xl/2xl;
      // page templates migrate as CP-3..5 touch them. Values mirror the
      // preset's border.radius tokens (formField lg=0.5rem, dialog 1rem).
      borderRadius: {
        card: '1rem',
        chip: '0.75rem',
        control: '0.5rem',
      },

      // Soft-elevation card shadow (owner 2026-07-22, Purity-style soft UI):
      // neutral black alpha only — never colored. Dark mode deepens it via
      // the .app-dark overrides in styles.scss.
      boxShadow: {
        card: '0 6px 20px -6px rgb(0 0 0 / 0.1), 0 2px 8px -2px rgb(0 0 0 / 0.06)',
      },

      // Used to cap PrimeNG dialogs on narrow viewports so the chrome
      // never goes edge-to-edge — keeps a 1/12 gutter on each side.
      maxWidth: {
        '11/12': '91.6667%',
      },

      // Template-builder preview floor: the pane scrolls horizontally on
      // narrow viewports instead of collapsing section columns (06 §5.3).
      // Keyed on the spacing scale (136 × 0.25rem = 34rem) so it reads as a
      // Tailwind token, not a component-named one-off.
      minWidth: {
        136: '34rem',
      },
    },
  },
  plugins: [],
};
