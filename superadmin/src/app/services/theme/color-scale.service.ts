import { Injectable } from '@angular/core';
import { palette } from '@primeuix/themes';
import { BRAND_SCALE_STEPS } from '../../model/constants/brand/scale-steps.const';
import type { BrandColorScale } from '../../data/dtos/brand';

const HEX_RE = /^#?[0-9a-f]{6}$/i;
const HSL_COMPONENTS_RE =
  /^(\d{1,3}(?:\.\d+)?) (\d{1,3}(?:\.\d+)?)% (\d{1,3}(?:\.\d+)?)%$/;

/** PrimeNG's `palette()` emits 50…950; the brand contract is 0…1000 by 100
 *  (rule 2) — the endpoints remap, interior steps map one-to-one. */
const PALETTE_STEP_BY_BRAND_STEP: Record<string, string> = {
  '0': '50',
  '100': '100',
  '200': '200',
  '300': '300',
  '400': '400',
  '500': '500',
  '600': '600',
  '700': '700',
  '800': '800',
  '900': '900',
  '1000': '950',
};

/** Pure color math for the brand editor: ramp derivation from a base hex,
 *  WCAG contrast checks, and the hex ↔ HSL-components boundary conversions —
 *  the editor works in hex (pickers), the wire format is "H S% L%" (rule 2).
 *  DOM application lives in BrandThemeService. */
@Injectable({ providedIn: 'root' })
export class ColorScaleService {
  isHex(v: string): boolean {
    return HEX_RE.test(v.trim());
  }

  /** Two pickers in, materialized editor-internal **hex** ramps out (03 §3),
   *  keyed 0…1000. The advanced expander can override any step afterwards. */
  deriveScale(baseHex: string): Record<string, string> {
    const ramp = palette(this.normalize(baseHex)) as Record<string, string>;
    const scale: Record<string, string> = {};
    for (const step of BRAND_SCALE_STEPS) {
      scale[step] = this.normalize(ramp[PALETTE_STEP_BY_BRAND_STEP[step]]);
    }
    return scale;
  }

  /** Editor-internal hex ramp → the contract's HSL scale (PUT /brand + the
   *  runtime apply). Non-hex steps are skipped. */
  toWireScale(hexScale: Record<string, string>): BrandColorScale {
    const scale: BrandColorScale = {};
    for (const [step, hex] of Object.entries(hexScale)) {
      const components = this.hexToHslComponents(hex);
      if (components) scale[step] = components;
    }
    return scale;
  }

  /** Wire HSL scale → editor-internal hex (hydrating the pickers). Unparsable
   *  steps are omitted so the group keeps its previous/default value. */
  fromWireScale(scale: BrandColorScale | undefined): Record<string, string> {
    const hexScale: Record<string, string> = {};
    for (const [step, value] of Object.entries(scale ?? {})) {
      const hex = this.hslComponentsToHex(value);
      if (hex) hexScale[step] = hex;
    }
    return hexScale;
  }

  /** "#RRGGBB" → "H S% L%" (the rule-2 wire format). */
  hexToHslComponents(hex: string): string | null {
    if (!this.isHex(hex)) return null;
    const n = parseInt(this.normalize(hex).slice(1), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    let s = 0;
    if (d > 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    const round = (v: number) => Math.round(v * 10) / 10;
    return `${round(h)} ${round(s * 100)}% ${round(l * 100)}%`;
  }

  /** "H S% L%" → "#RRGGBB" (hydrating pickers from the wire format). */
  hslComponentsToHex(value: string): string | null {
    const m = HSL_COMPONENTS_RE.exec(value?.trim() ?? '');
    if (!m) return null;
    const h = Number(m[1]);
    const s = Number(m[2]) / 100;
    const l = Number(m[3]) / 100;
    if (h > 360 || s > 1 || l > 1) return null;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const hue = (h % 360) / 60;
    const x = chroma * (1 - Math.abs((hue % 2) - 1));
    const base = l - chroma / 2;
    const table: [number, number, number][] = [
      [chroma, x, 0],
      [x, chroma, 0],
      [0, chroma, x],
      [0, x, chroma],
      [x, 0, chroma],
      [chroma, 0, x],
    ];
    const [r, g, b] = table[Math.floor(hue) % 6];
    const channel = (v: number) =>
      Math.round(Math.min(1, Math.max(0, v + base)) * 255)
        .toString(16)
        .padStart(2, '0')
        .toUpperCase();
    return `#${channel(r)}${channel(g)}${channel(b)}`;
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
