import { BRAND_SCALE_STEPS } from './scale-steps';
import type { Brand, HslScale } from '../dtos/brand.dto';

// The backend-provided neutral default (rule 3): GET /brand serves this until
// the tenant row exists (manager push or owner save), so consumers always get
// a materialized palette. Identity fields stay absent/blank — blank means
// "unset", and consumers hide unset identity rather than fake it (rule 5).

const NEUTRAL_L_BY_STEP: Record<(typeof BRAND_SCALE_STEPS)[number], number> = {
  '0': 98,
  '100': 96,
  '200': 90,
  '300': 82,
  '400': 70,
  '500': 55,
  '600': 45,
  '700': 36,
  '800': 28,
  '900': 18,
  '1000': 10,
};

const neutralScale = (hue: number, saturation: number): HslScale =>
  Object.fromEntries(
    BRAND_SCALE_STEPS.map((step) => [
      step,
      `${hue} ${saturation}% ${NEUTRAL_L_BY_STEP[step]}%`,
    ]),
  );

export const DEFAULT_BRAND: Brand = {
  name: '',
  colors: {
    // A whisper of blue so interactive chrome still reads as such. Accent gets
    // the *same* neutral ramp rather than an invented hue (rule 3) — a
    // brandless instance renders gray, never a fake second brand color. The
    // chrome neutral is not here any more: it left the contract and is fixed
    // in each app's palette layer (22 § Target 3).
    primary: neutralScale(220, 10),
    accent: neutralScale(220, 10),
  },
};
