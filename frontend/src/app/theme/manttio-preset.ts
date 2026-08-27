import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

/**
 * PrimeNG Aura preset repointed to the runtime tenant brand (plan 22 CP-3).
 *
 * `primary` → the `--brand-primary-*` CSS variables. The chrome neutral is
 * **stock Tailwind `zinc`** (owner, 2026-08-27): the neutral left the brand
 * contract, so the field app stopped carrying a bespoke scale and uses the one
 * every dev already knows. These are zinc's own hexes, verbatim — the same
 * values `bg-zinc-700` resolves to in a template, so the preset and the utility
 * layer cannot drift.
 *
 * The brand model is HSL components at steps 0…1000 by 100 (branding rule 2),
 * but Aura's internal token references resolve against the 50…950 keys — so
 * the endpoint keys alias the brand endpoints (50 → step 0, 950 → step 1000)
 * and the interior steps map one-to-one; zinc already ships exactly those 11
 * keys, which is what makes the swap a straight substitution. Aura's own token
 * group is called `surface` — that name is PrimeNG's, not ours — and its step 0
 * stays pure white: cards are white, the page tint is `zinc-50`. Fallbacks for primary
 * are a neutral grayscale for the pre-fetch instant only (rule 3).
 */

const NEUTRAL_L_BY_STEP: Record<string, number> = {
  '0': 98, '100': 96, '200': 90, '300': 82, '400': 70, '500': 55,
  '600': 45, '700': 36, '800': 28, '900': 18, '1000': 10,
};

const brandScale = (name: 'primary', hue: number, saturation: number) => {
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

// Tailwind's zinc, verbatim. Kept as literals rather than imported so the
// preset carries no build-time dependency on the Tailwind config.
const zinc = {
  0: '#FFFFFF',
  50: '#FAFAFA',
  100: '#F4F4F5',
  200: '#E4E4E7',
  300: '#D4D4D8',
  400: '#A1A1AA',
  500: '#71717A',
  600: '#52525B',
  700: '#3F3F46',
  800: '#27272A',
  900: '#18181B',
  950: '#09090B',
};

export const ManttioPreset = definePreset(Aura, {
  semantic: {
    primary: brandScale('primary', 220, 10),
    colorScheme: {
      // `surface` is Aura's token name for the chrome neutral; we fill it with zinc.
      light: { surface: zinc },
      dark: { surface: zinc },
    },
  },
});
