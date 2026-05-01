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
                background: '#F6F7F7',  // granite-50
                surface: '#DDEBF4',     // sky-100
                primary: '#3F7A9D',     // sky-600
                secondary: '#8FBCD7',   // sky-300
                dark: '#2A3233',        // granite-800 (texts)
                granite: {
                    50: '#F6F7F7',
                    100: '#E4E6E7',
                    200: '#C9CECE',
                    300: '#A6ADAE',
                    400: '#798485',
                    500: '#4C5B5C',
                    600: '#414D4E',
                    700: '#353F40',
                    800: '#2A3233',
                    900: '#1E2425',
                    950: '#131717',
                },
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
                sky: {
                    50: '#F2F8FB',
                    100: '#DDEBF4',
                    200: '#BAD7E8',
                    300: '#8FBCD7',
                    400: '#6BA5C5',
                    500: '#4D91B6',
                    600: '#3F7A9D',
                    700: '#356481',
                    800: '#2C5269',
                    900: '#264558',
                    950: '#152C3B',
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
                sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                data: ['"Atkinson Hyperlegible"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [],
}