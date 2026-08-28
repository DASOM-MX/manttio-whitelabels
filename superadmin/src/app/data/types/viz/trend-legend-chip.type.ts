/** A legend chip in the `trend-card` header — chart.js's own legend stays off
 *  (01 § Data-viz), so the dot's class is resolved from the series tone here
 *  and rendered as chrome. */
export interface TrendLegendChip {
  label: string;
  dotClass: string;
}
