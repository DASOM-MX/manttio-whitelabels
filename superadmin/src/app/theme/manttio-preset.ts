import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * PrimeNG Aura preset customized to the Manttio palette (ported from
 * `frontend/src/app/theme/manttio-preset.ts`; PrimeNG 21 moved the theme
 * toolkit to `@primeuix/themes`).
 *
 * `primary`  → the `sky` Tailwind scale (matches `bg-sky-*` / `text-sky-*`)
 * `surface`  → the `granite` Tailwind scale (matches `bg-granite-*`)
 *
 * Both scales live in `tailwind.config.js`; if you re-tune them there, keep
 * this file in sync so Tailwind utilities and PrimeNG components stay
 * visually consistent. Module 03 (branding) updates this preset at runtime
 * from the tenant's brand — these are the manttio fallback values.
 */
export const ManttioPreset = definePreset(Aura, {
  semantic: {
    primary: {
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
    colorScheme: {
      light: {
        surface: {
          0: '#FFFFFF',
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
      },
      dark: {
        surface: {
          0: '#FFFFFF',
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
      },
    },
  },
});
