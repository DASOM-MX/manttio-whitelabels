/** The no-brand fallback ramp, mirroring `tailwind.config.js`'s
 *  `neutralScale(220, 10)` — the same values the `hsl(var(--brand-…, …))`
 *  utilities fall back to when a tenant has never set a scale (branding rule
 *  3: a brandless instance renders neutral chrome, never an invented hue).
 *
 *  Canvas can't read a Tailwind class, so anything drawing into one (charts)
 *  resolves the CSS variable itself and needs this same fallback in hand, or
 *  a brandless tenant would get `hsl()` of an empty string. Keyed by
 *  `BRAND_SCALE_STEPS`; values are HSL components ("H S% L%", rule 2). */
export const BRAND_FALLBACK_HSL: Record<string, string> = {
  '0': '220 10% 98%',
  '100': '220 10% 96%',
  '200': '220 10% 90%',
  '300': '220 10% 82%',
  '400': '220 10% 70%',
  '500': '220 10% 55%',
  '600': '220 10% 45%',
  '700': '220 10% 36%',
  '800': '220 10% 28%',
  '900': '220 10% 18%',
  '1000': '220 10% 10%',
};
