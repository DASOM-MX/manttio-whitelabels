import { VizTone } from '../../enums/viz/viz-tone.enum';

/** `RULE_TONE_CLASSES`, as SVG strokes — the gauge arc is the only surface in
 *  the kit drawn with vectors rather than boxes, and Tailwind's `stroke-*`
 *  utilities are a separate family from `bg-*`. Same steps, same reason: the
 *  arc is non-text (3:1), and dark mode lifts instead of deepening. */
export const STROKE_TONE_CLASSES: Record<VizTone, string> = {
  [VizTone.Neutral]: 'stroke-surface-400 dark:stroke-surface-600',
  [VizTone.Brand]: 'stroke-primary-600 dark:stroke-primary-400',
  [VizTone.Accent]: 'stroke-accent-500 dark:stroke-accent-400',
  [VizTone.Positive]: 'stroke-emerald-500 dark:stroke-emerald-400',
  [VizTone.Negative]: 'stroke-red-500 dark:stroke-red-400',
  [VizTone.Warning]: 'stroke-amber-500 dark:stroke-amber-400',
};
