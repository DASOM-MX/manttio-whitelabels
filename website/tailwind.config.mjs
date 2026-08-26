// Palette: plan 22 — two tenant scales, `primary` and `accent`, reading
// --brand-primary-* / --brand-accent-* CSS variables injected at request time
// from GET /brand (src/lib/theme.ts). Values are HSL components ("H S% L%") at
// steps 0…1000 by 100 (branding rule 2). Fallbacks are a neutral grayscale for
// the no-brand instant only — the real default palette comes from the backend
// (rule 3), and accent's fallback is deliberately the same neutral as primary,
// so a brandless instance renders gray chrome rather than an invented hue.
//
// The chrome neutral is **stock Tailwind `zinc`** (owner, 2026-08-27), matching
// the field app. Surface left the brand contract in CP-1, so there is nothing
// tenant-specific left to express and no reason to ship a bespoke neutral:
// `zinc-*` needs no config, no fallbacks, and no explanation to a new dev.
// Nothing here defines it — it is Tailwind's own. Steps map 0→50 and 1000→950
// with the interior one-to-one, because zinc happens to ship exactly the 11
// keys the brand model has.
//
// Legacy names (granite, sky, navy, cyan) are tombstoned as empty objects and
// must never be deleted: theme.extend merges with the default theme, and `sky`
// and `cyan` are stock Tailwind names, so deletion would silently render stock
// blue for any straggler instead of emitting nothing.

import colors from 'tailwindcss/colors.js';

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

const brandScale = (name, fallbacks) =>
  Object.fromEntries(
    Object.entries(fallbacks).map(([step, hsl]) => [
      step,
      `hsl(var(--brand-${name}-${step}, ${hsl}) / <alpha-value>)`,
    ]),
  );

// Primary and accent share one neutral fallback ramp — a whisper of blue so
// interactive chrome still reads as such, and never an invented accent hue.
const neutralFallback = neutralScale(220, 10);
const primary = brandScale('primary', neutralFallback);
const accent = brandScale('accent', neutralFallback);

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx,svelte,vue}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--brand-font-body, "Work Sans")', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['var(--brand-font-heading, Rubik)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        caps: '0.18em',
      },
      colors: {
        primary: { ...primary, DEFAULT: primary['600'] }, // brand anchor
        accent: { ...accent, DEFAULT: accent['500'] }, // categorical / decorative
        // The one alias worth keeping: `background` names the page ground, read
        // from Tailwind's own palette so it can never drift from `bg-zinc-50`.
        // `dark` (body text) retired with the neutral going stock — the page
        // says `text-zinc-800`, and an alias one template calls is indirection.
        background: colors.zinc[50],
        // Legacy tombstones: must never be deleted (see comment above).
        granite: {},
        sky: {},
        navy: {},
        cyan: {},
      },
    },
  },
  plugins: [],
};
