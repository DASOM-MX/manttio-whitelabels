import { Injectable } from '@angular/core';
import type { ScriptableContext } from 'chart.js';
import { BRAND_FALLBACK_HSL } from '../../model/constants/brand/fallback-hsl.const';
import { VizTone } from '../../model/enums/viz/viz-tone.enum';

/** The fixed semantic set and the neutral, as canvas colors.
 *
 *  Charts draw into a canvas, so a Tailwind class is no use to them and these
 *  have to be literals — the mirror of `RULE_TONE_CLASSES`, which is the
 *  authority. Only the *fixed* scales appear here: `emerald`/`red`/`amber` are
 *  stock Tailwind and never brand-derived (§ Direction 3), and `surface` left
 *  the brand contract at plan 22, so none of the five emits a CSS variable to
 *  read. Brand tones resolve through `--brand-*` instead — see `color()`. */
const FIXED_TONE_HSL: Record<string, { light: string; dark: string }> = {
  // surface-500 / surface-400 — the fixed chrome neutral (hue 240, 5%).
  [VizTone.Neutral]: { light: '240 5% 55%', dark: '240 5% 70%' },
  [VizTone.Positive]: { light: '160 84% 39%', dark: '158 64% 52%' }, // emerald-500/400
  [VizTone.Negative]: { light: '0 84% 60%', dark: '0 91% 71%' }, // red-500/400
  [VizTone.Warning]: { light: '38 92% 50%', dark: '43 96% 56%' }, // amber-500/400
};

/** Axis chrome, one step fainter than the data (01 § Data-viz: faint y-grid
 *  only). Fixed neutral, same reason as above — and at the *cooled* hue 240 /
 *  5% the surface scale took at 23 CP-1, which is what makes the grid sit in
 *  the same family as the card it's drawn on. */
const AXIS_TICK_HSL = { light: '240 5% 55%', dark: '240 5% 70%' }; // surface-500/400
const AXIS_GRID_HSL = { light: '240 5% 90%', dark: '240 5% 28%' }; // surface-200/800

/** Brand colors for canvases (23 CP-3).
 *
 *  Tailwind resolves `bg-primary-600` to `hsl(var(--brand-primary-600, …))`
 *  at style time; a chart has no style pass, so it reads the same variable off
 *  `:root` and falls back to the same neutral ramp. Every read is live, so a
 *  caller that recomputes on the dark-mode signal — or after the brand editor
 *  writes new variables — gets the new palette without a reload.
 *
 *  Color processing lives in `services/theme/` (house rule); the DOM side of
 *  branding stays in `BrandThemeService`, which is what *sets* these vars. */
@Injectable({ providedIn: 'root' })
export class ChartPaletteService {
  /** A tone as a canvas color. Brand tones step down for dark mode the way
   *  `RULE_TONE_CLASSES` does (600→400 primary, 500→400 accent): the fill is
   *  read against `surface-900` there, not against white. */
  color(tone: VizTone, dark: boolean, alpha = 1): string {
    if (tone === VizTone.Brand) return this.brand('primary', dark ? '400' : '600', alpha);
    if (tone === VizTone.Accent) return this.brand('accent', dark ? '400' : '500', alpha);
    const fixed = FIXED_TONE_HSL[tone] ?? FIXED_TONE_HSL[VizTone.Neutral];
    return this.hsl(dark ? fixed.dark : fixed.light, alpha);
  }

  axisTick(dark: boolean): string {
    return this.hsl(dark ? AXIS_TICK_HSL.dark : AXIS_TICK_HSL.light, 1);
  }

  axisGrid(dark: boolean): string {
    return this.hsl(dark ? AXIS_GRID_HSL.dark : AXIS_GRID_HSL.light, dark ? 0.6 : 0.8);
  }

  /** The one sanctioned gradient (01 § Design language): a single-hue area
   *  fill under the hero line, fading to transparent. Scriptable because the
   *  gradient needs the chart area, which doesn't exist on the first frame. */
  areaFill(topColor: string) {
    return (context: ScriptableContext<'line'>): string | CanvasGradient => {
      const { ctx, chartArea } = context.chart;
      if (!chartArea) return 'transparent';
      const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      gradient.addColorStop(0, topColor);
      gradient.addColorStop(1, 'transparent');
      return gradient;
    };
  }

  /** Live `--brand-<scale>-<step>`, else the ramp baked into the Tailwind
   *  config — never an empty `hsl()`. */
  private brand(scale: 'primary' | 'accent', step: string, alpha: number): string {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(`--brand-${scale}-${step}`)
      .trim();
    return this.hsl(value || BRAND_FALLBACK_HSL[step], alpha);
  }

  /** Space-separated `hsl()` — canvas gradients parse the modern syntax. */
  private hsl(components: string, alpha: number): string {
    return alpha === 1 ? `hsl(${components})` : `hsl(${components} / ${alpha})`;
  }
}
