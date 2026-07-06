import { palette } from '@primeuix/themes';
import type { BrandColorScale } from '../data/dtos/brand';

export const PRIMARY_STEPS = [
  '50',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
  '950',
] as const;
export const SURFACE_STEPS = ['0', ...PRIMARY_STEPS] as const;

const HEX_RE = /^#?[0-9a-f]{6}$/i;

export const isHex = (v: string): boolean => HEX_RE.test(v.trim());

const normalize = (v: string): string => {
  const t = v.trim();
  return t.startsWith('#') ? t.toUpperCase() : `#${t.toUpperCase()}`;
};

/** Two pickers in, materialized ramps out (03 §3): PrimeNG's `palette()` for
 *  the 50–950 steps; surface additionally anchors step 0 at white. Consumers
 *  never run palette math — these values persist as-is. */
export const deriveScale = (baseHex: string, withZero: boolean): BrandColorScale => {
  const ramp = palette(normalize(baseHex)) as Record<string, string>;
  const scale: BrandColorScale = {};
  if (withZero) scale['0'] = '#FFFFFF';
  for (const step of PRIMARY_STEPS) scale[step] = normalize(ramp[step]);
  return scale;
};

// ── WCAG contrast (03 §3: warn, don't block) ───────────────────────────────

const channel = (v: number): number => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const luminance = (hex: string): number => {
  const n = parseInt(normalize(hex).slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
};

export const contrastRatio = (hexA: string, hexB: string): number => {
  if (!isHex(hexA) || !isHex(hexB)) return 21;
  const [l1, l2] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
};
