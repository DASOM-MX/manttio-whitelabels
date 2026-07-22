import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * PrimeNG Aura preset repointed to the runtime tenant brand (03 §4; same
 * pattern as `frontend/src/app/theme/manttio-preset.ts` — PrimeNG 21 moved
 * the theme toolkit to `@primeuix/themes`).
 *
 * `primary` → the `--brand-primary-*` CSS variables, `surface` → the
 * `--brand-surface-*` variables — the same vars Tailwind's scales read
 * (`tailwind.config.js`), set at boot/save/preview by `BrandThemeService`, so
 * Tailwind utilities and PrimeNG component chrome follow the brand together
 * (no runtime `updatePreset` calls needed).
 *
 * The brand model is HSL components at steps 0…1000 by 100 (branding rule 2),
 * but Aura's internal token references resolve against the 50…950 keys — so
 * the endpoint keys alias the brand endpoints (50 → step 0, 950 → step 1000)
 * and the interior steps map one-to-one. `surface.0` stays pure white: the
 * templates pair PrimeNG panels with Tailwind `bg-white` cards, and white is
 * neutral, not brand. Fallbacks are the same neutral grayscale as
 * `tailwind.config.js` — for the no-brand instant only (rule 3).
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

/* Preset-first chrome (plan 17, owner 2026-07-22): component shape/spacing
 * decisions live HERE as design tokens, not in override sheets — a value we
 * would have put in a sheet goes in a token whenever Aura exposes one. The
 * only surviving sheets in `src/theme/` are layout-integration rules and
 * house visual cues no token can express (see `src/theme/_index.scss`). */
export const ManttioPreset = definePreset(Aura, {
  semantic: {
    primary: brandScale('primary', 220, 10),
    // Inputs sit on the house rounded-lg + px-3.5. Responsive heights/text
    // stay in `src/theme/forms.scss` — no token is breakpoint-aware. Focus
    // adds a soft 4px halo (the `.field-input` ring language) on top of the
    // primary border — raw hsl(var()) because tokens can't alpha-reference.
    formField: {
      paddingX: '0.875rem',
      borderRadius: '{border.radius.lg}',
      focusRing: {
        width: '4px',
        style: 'solid',
        color: 'hsl(var(--brand-primary-600, 220 10% 45%) / 0.22)',
        offset: '0',
      },
    },
    colorScheme: {
      light: {
        surface,
        // Interactive solids anchor at 600/700/800 like `.btn-primary` —
        // white on 400/500 doesn't clear 4.5:1 (01 Accessibility).
        primary: {
          color: '{primary.600}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.700}',
          activeColor: '{primary.800}',
        },
        // Soft branded outline (owner 2026-07-22, third revision that day:
        // neutral surface-gray → solid primary-700 → this, after the solid
        // read too loud on stacked forms): the 1px outline strengthens as you
        // approach — primary-600/40 tint at rest, solid 600 on hover, 700 +
        // halo on focus. Alpha can't reference a token, hence raw hsl(var())
        // (fallback = the neutral ladder). `.field-input` mirrors these so
        // raw inputs and PrimeNG controls read identically side-by-side.
        formField: {
          borderColor: 'hsl(var(--brand-primary-600, 220 10% 45%) / 0.4)',
          hoverBorderColor: '{primary.600}',
          focusBorderColor: '{primary.700}',
        },
      },
      dark: {
        surface,
        primary: {
          color: '{primary.600}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.500}',
          activeColor: '{primary.400}',
        },
        // Dark-mode analog of the soft branded outline: a dark primary
        // vanishes on the surface-900 field, so the ladder rides the LIGHT
        // end of the primary scale — 400/40 tint at rest, solid 400 on
        // hover/focus (+ halo on focus). Still the tenant's hue.
        formField: {
          background: '{surface.900}',
          borderColor: 'hsl(var(--brand-primary-400, 220 10% 70%) / 0.4)',
          hoverBorderColor: '{primary.400}',
          focusBorderColor: '{primary.400}',
        },
      },
    },
  },
  components: {
    // Blob-pill actions (01 shape boundary: buttons rounded-full) — native
    // buttons get it from `.btn`; this keeps any future <p-button> in the
    // same language.
    button: { root: { borderRadius: '9999px', paddingX: '1.25rem' } },
    // Overlay panels ride the card radius language (cards rounded-2xl,
    // dialogs one step under).
    dialog: { root: { borderRadius: '1rem' } },
  },
});
