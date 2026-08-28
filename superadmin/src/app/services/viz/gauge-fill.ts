/** How many of a gauge's ticks are filled at a given percentage (23 CP-3).
 *
 *  `null` is not 0: a rate with no denominator yet — no intake in the period,
 *  no contracts to comply with — renders an empty arc under an em dash, which
 *  is a different reading from "0 %, we missed everything". Out-of-range
 *  values clamp rather than overflow the arc, since a percentage over 100 is a
 *  caller's rounding artifact and not something to draw. */
export const gaugeFilledTicks = (value: number | null, tickCount: number): number => {
  if (value === null || Number.isNaN(value)) return 0;
  const clamped = Math.min(Math.max(value, 0), 100);
  return Math.round((clamped / 100) * tickCount);
};
