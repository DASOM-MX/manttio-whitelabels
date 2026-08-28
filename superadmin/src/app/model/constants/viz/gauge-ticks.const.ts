import type { GaugeTick } from '../../../data/types/viz/gauge-tick.type';

/** Enough ticks to read as an arc rather than a bar chart, few enough that
 *  each one still has daylight around it: at r = 92 the semicircle is ~289
 *  units long, so 40 ticks sit on a 7.2-unit pitch and a 4-wide stroke leaves
 *  a ~3-unit gap. Also the resolution of the reading — one tick is 2.5 %. */
const TICK_COUNT = 40;

// The arc's own coordinate space (viewBox "0 0 200 108"): a semicircle
// centred on the bottom edge, drawn from 180° to 360°.
const CENTER_X = 100;
const CENTER_Y = 100;
const OUTER_RADIUS = 92;
const INNER_RADIUS = 74;

const round = (value: number): number => Math.round(value * 100) / 100;

/** Tick geometry, computed once at load: the arc never changes shape, so a
 *  gauge render is a class swap per tick and nothing else. Index 0 is the
 *  left end (0 %), the last is the right end (100 %). */
export const GAUGE_TICKS: GaugeTick[] = Array.from({ length: TICK_COUNT }, (_, index) => {
  const angle = Math.PI + ((index + 0.5) * Math.PI) / TICK_COUNT;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    index,
    x1: round(CENTER_X + INNER_RADIUS * cos),
    y1: round(CENTER_Y + INNER_RADIUS * sin),
    x2: round(CENTER_X + OUTER_RADIUS * cos),
    y2: round(CENTER_Y + OUTER_RADIUS * sin),
  };
});
