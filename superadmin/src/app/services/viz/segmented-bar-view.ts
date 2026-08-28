import { RULE_TONE_CLASSES } from '../../model/constants/viz/rule-tone-classes.const';
import { VizTone } from '../../model/enums/viz/viz-tone.enum';
import type { BarSegment } from '../../data/types/viz/bar-segment.type';
import type { BarSegmentView } from '../../data/types/viz/bar-segment-view.type';

/** Below this share a segment's own label stops fitting, so narrow members
 *  are floored here and the row is renormalized — the bar reads the *mix*, and
 *  a 1 % member rendered as a hairline with an unreadable label reads nothing.
 *  Everything above the floor stays exactly proportional. */
const MIN_SEGMENT_PCT = 12;

/** Counts print with locale separators ("2,884") unless the caller supplies
 *  its own `valueText` (currency, "1,2 k"). */
const SEGMENT_COUNT_FORMAT = new Intl.NumberFormat('es-MX');

/** Resolve a mix for `segmented-bar`: share of the total in percent, the
 *  rule's fill class, and the printable count (23 CP-3).
 *
 *  Two degradations live here, both deliberate. **Total 0** returns an empty
 *  array — the component draws a bare track, not a row of zero-width slivers.
 *  **One segment** goes `Neutral`: a bar with nothing to compare against would
 *  be spending a brand color on decoration pretending to be data.
 *
 *  Negative counts are clamped to 0 rather than rejected: a mix is a display
 *  of what a query returned, and one bad row should cost its own segment, not
 *  the card. */
export const segmentedBarView = (segments: BarSegment[]): BarSegmentView[] => {
  const counts = segments.map((segment) => Math.max(segment.count, 0));
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) return [];

  const solo = segments.length === 1;
  const floored = counts.map((count) => Math.max((count / total) * 100, MIN_SEGMENT_PCT));
  const flooredTotal = floored.reduce((sum, pct) => sum + pct, 0);

  return segments.map((segment, index) => ({
    id: segment.id,
    label: segment.label,
    valueText: segment.valueText ?? SEGMENT_COUNT_FORMAT.format(segment.count),
    ruleClass: RULE_TONE_CLASSES[solo ? VizTone.Neutral : segment.tone],
    widthPct: ((floored[index] ?? 0) / flooredTotal) * 100,
  }));
};
