/**
 * Superadmin Tailwind config — ported from `frontend/tailwind.config.js`.
 *
 * Whitelabel twist (02-app-shell.md §5): the `sky` (primary) and `granite`
 * (surface) scales resolve through CSS variables so the boot-time
 * `GET /brand` fetch (module 03) can re-theme the app at runtime — the
 * `BrandThemeService` sets `--brand-primary-*` / `--brand-surface-*` on
 * `:root`. Values are HSL components ("H S% L%") at steps 0…1000 by 100
 * (branding rule 2). Fallbacks are a minimal neutral grayscale for the
 * no-brand instant only — the real default palette comes from the backend
 * (rule 3). `navy`/`cyan` stay static (non-brand accents).
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
const granite = brandScale('surface', neutralScale(0, 0));
const sky = brandScale('primary', neutralScale(220, 10));

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  // Use a custom `.app-dark` class instead of the default `.dark`, so it lines
  // up with PrimeNG's `darkModeSelector` and we toggle a single class on `<html>`.
  darkMode: ['class', '.app-dark'],
  theme: {
    extend: {
      colors: {
        background: granite['0'], // page bg
        surface: sky['100'],
        primary: sky['600'],
        secondary: sky['300'],
        dark: granite['800'], // texts
        granite,
        sky,
        navy: {
          50: '#F1F5F9',
          100: '#E0E7EE',
          200: '#BFCDD9',
          300: '#94A8BC',
          400: '#6A839E',
          500: '#4C6783',
          600: '#3B536A',
          700: '#314357',
          800: '#243345',
          900: '#1B2937',
          950: '#0F1923',
        },
        cyan: {
          50: '#ECF8FD',
          100: '#D2F0FB',
          200: '#A8E2F6',
          300: '#71CDEC',
          400: '#62BCDD',
          500: '#4BA8D1',
          600: '#2F88AF',
          700: '#266F92',
          800: '#235974',
          900: '#1F4A60',
          950: '#102B3D',
        },
      },

      fontFamily: {
        // Commissioner is the superadmin's own voice (01-conventions Typography) —
        // constant across tenants, a deliberate deviation from frontend parity.
        sans: ['"Commissioner Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Numeric/data stack. Commissioner's `tnum` proved a no-op (measured
        // 2026-07-06: digit widths differ with the feature on), so per the 01
        // fallback decision the head is Atkinson Hyperlegible — the
        // frontend's existing numeric stack.
        data: [
          '"Atkinson Hyperlegible"',
          '"Commissioner Variable"',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },

      fontSize: {
        // Micro-labels (01 Design language): 11px card/table headers.
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
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
