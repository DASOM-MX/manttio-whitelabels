/**
 * Superadmin Tailwind config — semantic brand scales (plan 22 CP-2).
 *
 * Whitelabel: tenant configures two brand colors via CSS variables:
 * - `primary` (brand anchor — buttons, links, focus; `--brand-primary-*` variables)
 * - `accent` (brand accent — new in plan 22; `--brand-accent-*` variables)
 * The `surface` scale is a **fixed chrome neutral** (hue 0°, 0% saturation) set at
 * build time — no CSS variables, no tenant editor control. The `BrandThemeService`
 * sets `--brand-primary-*` and `--brand-accent-*` on `:root` at boot/save/preview.
 * Values are HSL components ("H S% L%") at steps 0…1000 by 100 (branding rule 2).
 * Fallbacks are a minimal neutral grayscale for the no-brand instant only (rule 3).
 *
 * Utility name = scale name = wire name (`bg-primary-600`,
 * `dark:bg-surface-800`, `bg-accent-500`) — no mapping table to carry in your head.
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

// Brand colors read `--brand-<name>-*` CSS variables with neutral fallbacks.
// Accent's default is the same neutral ramp as primary (branding rule 3) — a
// brandless instance renders gray chrome, never an invented hue.
const primary = brandScale('primary', neutralScale(220, 10));
const accent = brandScale('accent', neutralScale(220, 10));

// Fixed neutral surface (plan 22 §Target) — no CSS variables. Literal HSL values
// built from the fixed lightness table. <alpha-value> support persists for utility
// variants like `bg-surface-200/60`.
const surface = Object.fromEntries(
  Object.entries(NEUTRAL_L_BY_STEP).map(([step, l]) => [
    step,
    `hsl(0 0% ${l}% / <alpha-value>)`,
  ]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  // Use a custom `.app-dark` class instead of the default `.dark`, so it lines
  // up with PrimeNG's `darkModeSelector` and we toggle a single class on `<html>`.
  darkMode: ['class', '.app-dark'],
  theme: {
    extend: {
      colors: {
        // The two tenant-configurable brand scales + a fixed neutral surface
        // (plan 22 §Target). `primary`/`accent` carry identical names across
        // frontend / superadmin / website; `surface` does NOT — the field app
        // and the website deleted their neutral scale on 2026-08-27 and use
        // stock Tailwind `zinc` instead, so this one is superadmin's alone.
        primary: { ...primary, DEFAULT: primary['600'] }, // brand anchor (buttons, links, focus)
        accent: { ...accent, DEFAULT: accent['500'] }, // brand accent (new plan 22)
        surface: { ...surface, DEFAULT: surface['100'] }, // fixed chrome neutral
        // Page bg sits one step under the card whites so the soft-UI
        // elevation actually reads (owner 2026-07-22) — a deliberate
        // superadmin-only divergence from the shared surface-0 value.
        background: surface['100'],
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
      // (the sidebar edge rides `rounded-r-shell`), `rounded-chip` for icon
      // chips + popovers, `rounded-control` for inputs/buttons/nav rows
      // (buttons joined 2026-07-22 — default-PrimeNG shape, no more pills).
      // Status/role pills + chrome icon-circles stay `rounded-full`. New
      // chrome uses these, never raw rounded-lg/xl/2xl;
      // page templates migrate as CP-3..5 touch them. Values mirror the
      // preset's border.radius tokens (formField lg=0.5rem, dialog 1rem).
      borderRadius: {
        card: '1rem',
        chip: '0.75rem',
        control: '0.5rem',
        // Sidebar right edge only (owner 2026-07-23): a deeper curve than
        // the shared card radius so the brand panel reads as its own shape.
        shell: '2.35rem',
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
