// Palette: plan 22 — two tenant scales, `primary` and `accent`, reading
// --brand-primary-* / --brand-accent-* CSS variables injected at runtime by the
// App brand effect (src/app/theme/brand-css.ts) from GET /brand. Values are HSL
// components ("H S% L%") at steps 0…1000 by 100 (branding rule 2). Fallbacks are
// a neutral grayscale for the pre-fetch instant only — the real default palette
// comes from the backend (rule 3), and accent's fallback is deliberately the
// same neutral as primary, so a brandless instance renders gray chrome rather
// than an invented second hue.
//
// The chrome neutral is **stock Tailwind `zinc`** (owner, 2026-08-27). Surface
// left the brand contract, so there is nothing tenant-specific left to express
// and no reason to ship a bespoke neutral: `zinc-*` needs no config, no
// fallbacks, and no explanation to a new dev. Nothing here defines it — it is
// Tailwind's own. Steps map 0→50 and 1000→950 with the interior one-to-one, the
// same endpoint convention the PrimeNG preset uses, because zinc happens to
// ship exactly the 11 keys the brand model has.
//
// Legacy names (granite, sky, navy, cyan) are tombstoned as empty objects and
// must never be deleted: theme.extend merges with the default theme, and `sky`
// and `cyan` are stock Tailwind names, so deletion would silently render stock
// blue for any straggler instead of emitting nothing.

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

// Read from Tailwind's own palette so the two aliases below can never drift
// from what `bg-zinc-50` / `text-zinc-800` resolve to in a template.
const { zinc } = require('tailwindcss/colors');

const brandScale = (name, fallbacks) =>
    Object.fromEntries(
        Object.entries(fallbacks).map(([step, hsl]) => [
            step,
            `hsl(var(--brand-${name}-${step}, ${hsl}) / <alpha-value>)`,
        ]),
    );

// Primary scale: tenant-configurable brand color (or neutral fallback).
// Accent scale: tenant-configurable decorative/categorical color (or neutral fallback).
const primary = brandScale('primary', neutralScale(220, 10));
const accent = brandScale('accent', neutralScale(220, 10));

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{html,ts}",
    ],
    // Use a custom `.app-dark` class instead of the default `.dark`, so it lines
    // up with PrimeNG's `darkModeSelector` and we toggle a single class on `<html>`.
    darkMode: ['class', '.app-dark'],
    theme: {
        extend: {
            colors: {
                primary: { ...primary, DEFAULT: primary['600'] },
                accent: { ...accent, DEFAULT: accent['500'] },
                // The one alias worth keeping: `background` names the page
                // ground, and 13 templates say it. `dark` (body text) retired
                // with the neutral going stock — templates say `text-zinc-800`
                // directly, and an alias nothing calls is just indirection.
                background: zinc[50],
                // Legacy tombstones: must never be deleted (see comment above).
                granite: {},
                navy: {},
                sky: {},
                cyan: {},
            },

            fontFamily: {
                sans: ['var(--brand-font-body, Inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                data: ['"Atkinson Hyperlegible"', 'var(--brand-font-body, Inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
            },

            // Used to cap PrimeNG dialogs on narrow viewports so the chrome
            // never goes edge-to-edge — keeps a 1/12 gutter on each side.
            maxWidth: {
                '11/12': '91.6667%',
            },
        },
    },
    plugins: [],
}
