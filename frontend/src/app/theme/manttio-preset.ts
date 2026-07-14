import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

/**
 * PrimeNG Aura preset repointed to the runtime tenant brand (plan 02 §1.3).
 *
 * `primary` → the `--brand-primary-*` CSS variables, `surface` → the
 * `--brand-surface-*` variables — the same vars Tailwind's scales read
 * (`tailwind.config.js`), injected at runtime by the App brand effect, so
 * Tailwind utilities and PrimeNG component chrome follow the brand together.
 *
 * The brand model is HSL components at steps 0…1000 by 100 (branding rule 2),
 * but Aura's internal token references resolve against the 50…950 keys — so
 * the endpoint keys alias the brand endpoints (50 → step 0, 950 → step 1000)
 * and the interior steps map one-to-one. `surface.0` stays pure white: the
 * templates pair PrimeNG panels with Tailwind `bg-white` cards, and white is
 * neutral, not brand. Fallbacks are the same neutral grayscale as
 * `tailwind.config.js` — for the pre-fetch instant only (rule 3).
 */

const NEUTRAL_L_BY_STEP: Record<string, number> = {
  '0': 98, '100': 96, '200': 90, '300': 82, '400': 70, '500': 55,
  '600': 45, '700': 36, '800': 28, '900': 18, '1000': 10,
};

const brandScale = (name: 'primary' | 'surface', hue: number, saturation: number) => {
  const at = (step: string) =>
    `hsl(var(--brand-${name}-${step}, ${hue} ${saturation}% ${NEUTRAL_L_BY_STEP[step]}%))`;
  return {
    50: at('0'),
    100: at('100'),
    200: at('200'),
    300: at('300'),
    400: at('400'),
    500: at('500'),
    600: at('600'),
    700: at('700'),
    800: at('800'),
    900: at('900'),
    950: at('1000'),
  };
};

const surface = { 0: '#FFFFFF', ...brandScale('surface', 0, 0) };

export const ManttioPreset = definePreset(Aura, {
  semantic: {
    primary: brandScale('primary', 220, 10),
    colorScheme: {
      light: { surface },
      dark: { surface },
    },
  },
});
