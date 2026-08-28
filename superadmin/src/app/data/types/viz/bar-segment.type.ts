import type { VizTone } from '../../../model/enums/viz/viz-tone.enum';

/** One member of a `segmented-bar` mix (23 CP-3): a colored rule whose width
 *  is its share of the total, with its count and label underneath.
 *
 *  `count` is the raw number — the bar computes the share itself, so callers
 *  never pre-compute percentages. `valueText` overrides how that count prints
 *  (currency, "1,2 k") without changing the math. */
export interface BarSegment {
  id: string;
  label: string;
  count: number;
  tone: VizTone;
  valueText?: string;
}
