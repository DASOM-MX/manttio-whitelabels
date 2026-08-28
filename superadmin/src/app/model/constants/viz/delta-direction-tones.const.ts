import { DeltaDirection } from '../../enums/viz/delta-direction.enum';
import { VizTone } from '../../enums/viz/viz-tone.enum';

/** The default reading of a delta's direction: up is good, down is bad, flat
 *  is neither. Metrics that invert it (overdue follow-ups falling *is* the
 *  win) keep the honest arrow and pass `KpiDelta.tone` instead. */
export const DELTA_DIRECTION_TONES: Record<DeltaDirection, VizTone> = {
  [DeltaDirection.Up]: VizTone.Positive,
  [DeltaDirection.Down]: VizTone.Negative,
  [DeltaDirection.Flat]: VizTone.Neutral,
};
