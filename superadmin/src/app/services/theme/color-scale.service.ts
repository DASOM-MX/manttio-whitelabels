import { Injectable } from '@angular/core';
import { palette } from '@primeuix/themes';
import { PRIMARY_STEPS } from '../../model/constants/brand/primary-steps.const';
import type { BrandColorScale } from '../../data/dtos/brand';

const HEX_RE = /^#?[0-9a-f]{6}$/i;

/** Pure color math for the brand editor: ramp derivation from a base hex and
 *  WCAG contrast checks. DOM/PrimeNG application lives in BrandThemeService. */
@Injectable({ providedIn: 'root' })
export class ColorScaleService {
  isHex(v: string): boolean {
    return HEX_RE.test(v.trim());
  }

  /** Two pickers in, materialized ramps out (03 §3): PrimeNG's `palette()` for
   *  the 50–950 steps; surface additionally anchors step 0 at white. Consumers
   *  never run palette math — these values persist as-is. */
  deriveScale(baseHex: string, withZero: boolean): BrandColorScale {
    const ramp = palette(this.normalize(baseHex)) as Record<string, string>;
    const scale: BrandColorScale = {};
    if (withZero) scale['0'] = '#FFFFFF';
    for (const step of PRIMARY_STEPS) scale[step] = this.normalize(ramp[step]);
    return scale;
  }

  /** WCAG contrast (03 §3: warn, don't block). */
  contrastRatio(hexA: string, hexB: string): number {
    if (!this.isHex(hexA) || !this.isHex(hexB)) return 21;
    const [l1, l2] = [this.luminance(hexA), this.luminance(hexB)].sort((a, b) => b - a);
    return (l1 + 0.05) / (l2 + 0.05);
  }

  private normalize(v: string): string {
    const t = v.trim();
    return t.startsWith('#') ? t.toUpperCase() : `#${t.toUpperCase()}`;
  }

  private luminance(hex: string): number {
    const n = parseInt(this.normalize(hex).slice(1), 16);
    return (
      0.2126 * this.channel((n >> 16) & 255) +
      0.7152 * this.channel((n >> 8) & 255) +
      0.0722 * this.channel(n & 255)
    );
  }

  private channel(v: number): number {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
}
