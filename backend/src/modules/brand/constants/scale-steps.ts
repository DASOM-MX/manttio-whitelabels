// The 11 stops every materialized brand scale must carry (rule 2: HSL, 0…1000
// by 100). Validators require exactly this set; consumers emit one CSS var per
// step (`--brand-<scale>-<step>`).
export const BRAND_SCALE_STEPS = [
  '0',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '1000',
] as const;

export type BrandScaleStep = (typeof BRAND_SCALE_STEPS)[number];
