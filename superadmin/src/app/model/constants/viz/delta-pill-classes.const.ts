import { VizTone } from '../../enums/viz/viz-tone.enum';

/** Tinted pill (fill + text) for the KPI delta — the reference's green ↑ /
 *  red ↓ chip. Text rides the same steps as `VALUE_TONE_CLASSES` so it clears
 *  4.5:1 on the tint, which is a step off the card fill in both modes.
 *
 *  Brand/accent are absent by design: a delta is a good/bad reading and rides
 *  the fixed semantic set only (§ Direction 3 — never let a tenant's hue say
 *  "down"). `Neutral` is the flat pill. */
export const DELTA_PILL_CLASSES: Record<VizTone, string> = {
  [VizTone.Neutral]: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300',
  [VizTone.Brand]: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300',
  [VizTone.Accent]: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300',
  [VizTone.Positive]: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  [VizTone.Negative]: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',
  [VizTone.Warning]: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
};
