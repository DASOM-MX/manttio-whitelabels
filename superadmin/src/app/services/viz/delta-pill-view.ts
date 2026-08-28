import { DELTA_DIRECTION_ICONS } from '../../model/constants/viz/delta-direction-icons.const';
import { DELTA_DIRECTION_TONES } from '../../model/constants/viz/delta-direction-tones.const';
import { DELTA_PILL_CLASSES } from '../../model/constants/viz/delta-pill-classes.const';
import type { DeltaPillView } from '../../data/types/viz/delta-pill-view.type';
import type { KpiDelta } from '../../data/types/viz/kpi-delta.type';

/** Resolve a delta for the template: the direction picks the arrow and,
 *  unless the caller overrides `tone`, the color (23 CP-3).
 *
 *  A function rather than a component: two surfaces draw this pill — the KPI
 *  tile and the trend card's hero line — and a one-element wrapper component
 *  between them would buy nothing but a host box. Call it from a `computed`,
 *  never from a template (01: no inline function calls). */
export const deltaPillView = (delta: KpiDelta | null | undefined): DeltaPillView | null => {
  if (!delta) return null;
  const tone = delta.tone ?? DELTA_DIRECTION_TONES[delta.direction];
  return {
    text: delta.text,
    icon: DELTA_DIRECTION_ICONS[delta.direction],
    pillClass: DELTA_PILL_CLASSES[tone],
  };
};
