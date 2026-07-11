/**
 * Superadmin Tailwind config — ported from `frontend/tailwind.config.js`.
 *
 * Whitelabel twist (02-app-shell.md §5): the `sky` (primary) and `granite`
 * (surface) scales resolve through CSS variables so the boot-time
 * `GET /brand` fetch (module 03) can re-theme the app at runtime by setting
 * `--brand-primary-*` / `--brand-surface-*` triplets on `:root`. The manttio
 * palette values stay as fallbacks, so with no brand present the app renders
 * exactly like the frontend. `navy`/`cyan` stay static (non-brand accents).
 */

/** Build a Tailwind color scale that reads `--brand-<name>-<step>` with an
 *  RGB-triplet fallback, keeping `<alpha-value>` support. */
const brandScale = (name, fallbacks) =>
  Object.fromEntries(
    Object.entries(fallbacks).map(([step, rgb]) => [
      step,
      `rgb(var(--brand-${name}-${step}, ${rgb}) / <alpha-value>)`,
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
        background: 'rgb(var(--brand-surface-50, 246 247 247) / <alpha-value>)', // granite-50
        surface: 'rgb(var(--brand-primary-100, 221 235 244) / <alpha-value>)', // sky-100
        primary: 'rgb(var(--brand-primary-600, 63 122 157) / <alpha-value>)', // sky-600
        secondary: 'rgb(var(--brand-primary-300, 143 188 215) / <alpha-value>)', // sky-300
        dark: 'rgb(var(--brand-surface-800, 42 50 51) / <alpha-value>)', // granite-800 (texts)
        granite: brandScale('surface', {
          50: '246 247 247',
          100: '228 230 231',
          200: '201 206 206',
          300: '166 173 174',
          400: '121 132 133',
          500: '76 91 92',
          600: '65 77 78',
          700: '53 63 64',
          800: '42 50 51',
          900: '30 36 37',
          950: '19 23 23',
        }),
        sky: brandScale('primary', {
          50: '242 248 251',
          100: '221 235 244',
          200: '186 215 232',
          300: '143 188 215',
          400: '107 165 197',
          500: '77 145 182',
          600: '63 122 157',
          700: '53 100 129',
          800: '44 82 105',
          900: '38 69 88',
          950: '21 44 59',
        }),
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
