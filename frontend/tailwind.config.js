const { signalSetFn } = require('@angular/core/primitives/signals');

/** @type {import('tailwindcss').Config} */
module.exports = {
    presets: [require('@spartan-ng/brain/hlm-tailwind-preset')],
    content: [
        "./src/**/*.{html,ts}",
    ],
    theme: {
        extend: {
            colors: {
                background: '#FFFCFB',
                surface: '#ECF4F6',
                primary: '#457A9E',
                secondary: '#8FB8CB',
                dark: '#575B61', //texts
            },

            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                //roboto: ['Roboto', 'sans-serif'],
            },
        },
    },
    plugins: [],
}