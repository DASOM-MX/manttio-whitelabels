import { updatePrimaryPalette, updateSurfacePalette } from '@primeuix/themes';
import type { Brand, BrandColorScale } from '../data/dtos/brand';

/** Brand → runtime theming (03 §4): sets the `--brand-primary-*` /
 *  `--brand-surface-*` RGB triplets the Tailwind palette reads, and updates
 *  the PrimeNG preset palettes in the same step. With no brand (or missing
 *  scales) the variables are cleared so the manttio fallbacks baked into
 *  `tailwind.config.js` and `manttio-preset.ts` take over.
 *
 *  The editor's live preview reuses this same helper against draft values
 *  (03 §7); typography never applies to superadmin chrome — Commissioner is
 *  the product voice (01 Typography). */

export const hexToTriplet = (hex: string): string | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

const PRIMARY_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const SURFACE_STEPS = ['0', ...PRIMARY_STEPS];

const setScaleVars = (
  root: HTMLElement,
  prefix: 'primary' | 'surface',
  steps: string[],
  scale: BrandColorScale | undefined,
): void => {
  for (const step of steps) {
    const triplet = scale?.[step] ? hexToTriplet(scale[step]) : null;
    if (triplet) root.style.setProperty(`--brand-${prefix}-${step}`, triplet);
    else root.style.removeProperty(`--brand-${prefix}-${step}`);
  }
};

export const applyBrandTheme = (brand: Brand | null): void => {
  const root = document.documentElement;
  const primary = brand?.colors?.primary;
  const surface = brand?.colors?.surface;

  setScaleVars(root, 'primary', PRIMARY_STEPS, primary);
  setScaleVars(root, 'surface', SURFACE_STEPS, surface);

  // Keep PrimeNG's semantic palettes in lockstep with the Tailwind vars.
  if (primary && PRIMARY_STEPS.every((s) => primary[s])) {
    updatePrimaryPalette(Object.fromEntries(PRIMARY_STEPS.map((s) => [s, primary[s]])));
  }
  if (surface && PRIMARY_STEPS.every((s) => surface[s])) {
    updateSurfacePalette(
      Object.fromEntries(SURFACE_STEPS.filter((s) => surface[s]).map((s) => [s, surface[s]])),
    );
  }
};
