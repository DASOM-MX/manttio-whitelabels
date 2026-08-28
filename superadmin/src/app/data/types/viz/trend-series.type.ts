import type { VizTone } from '../../../model/enums/viz/viz-tone.enum';

/** One line of a `trend-card` (01 § Data-viz, 23 CP-3).
 *
 *  Tone picks the palette role, not a literal color: the hero series is
 *  `Brand` (and is the only one that gets the sanctioned area fill), the
 *  second is `Accent`. Values are plotted in the order given, against the
 *  card's shared `labels`. */
export interface TrendSeries {
  label: string;
  data: number[];
  tone: VizTone;
  /** The single-hue area fill under the line — the one sanctioned gradient
   *  (01 § Design language). Hero series only; two filled lines muddy each
   *  other. */
  fill?: boolean;
}
