// Whitelabel palette repoint (field-app-whitelabeling 02 §1.3): every scale
// reads a --brand-* CSS variable injected at runtime by the App brand effect
// (built in src/app/theme/brand-css.ts) from GET /brand. Values are HSL
// components ("H S% L%") at steps 0…1000 by 100 (branding rule 2). Fallbacks
// are a minimal neutral grayscale for the pre-fetch instant only — the real
// default palette comes from the backend (rule 3). Mapping: granite → surface
// scale; navy / sky / cyan → primary scale (the brand materializes exactly two
// scales). Mirrors website/tailwind.config.mjs.

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
const granite = brandScale('surface', neutralScale(0, 0));
const navy = brandScale('primary', neutralScale(220, 10));

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
                background: granite['0'],   // page bg
                surface: navy['100'],
                primary: navy['600'],
                secondary: navy['300'],
                dark: granite['800'],       // texts
                granite,
                navy,
                sky: navy,
                cyan: navy,
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
