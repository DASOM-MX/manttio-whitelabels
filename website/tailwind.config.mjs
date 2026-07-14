// Whitelabel palette repoint (plan 15 §3): every scale reads a --brand-* CSS
// variable injected at request time from GET /brand. Values are HSL components
// ("H S% L%") at steps 0…1000 by 100 (branding rule 2). Fallbacks are a
// minimal neutral grayscale for the no-brand instant only — the real default
// palette always comes from the backend (rule 3). Mapping: granite → surface
// scale; cyan / sky / navy → primary scale (the brand object materializes
// exactly two scales — 03 §3).

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

// A whisper of blue on primary so interactive chrome still reads as such;
// surface is pure grayscale (mirrors the backend's neutral default brand).
const granite = neutralScale(0, 0);
const navy = neutralScale(220, 10);
const sky = navy;
const cyan = navy;

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
        granite: brandScale('surface', granite),
        navy: brandScale('primary', navy),
        sky: brandScale('primary', sky),
        cyan: brandScale('primary', cyan),
      },
    },
  },
  plugins: [],
};
