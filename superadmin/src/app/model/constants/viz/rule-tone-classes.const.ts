import { VizTone } from '../../enums/viz/viz-tone.enum';

/** Fill classes for a **non-text** tone surface: segmented-bar rules, legend
 *  dots, gauge ticks. Non-text needs 3:1, not 4.5:1 (01 § Accessibility),
 *  which is why these sit a step lighter than `VALUE_TONE_CLASSES` and why
 *  the dark-mode step lifts instead of deepening — the fill is read against
 *  `surface-900`, not against white.
 *
 *  `Neutral` is the rest-of-the-mix gray, not a track: an empty track is
 *  `surface-100`/`surface-800` and lives in the component that draws it. */
export const RULE_TONE_CLASSES: Record<VizTone, string> = {
  [VizTone.Neutral]: 'bg-surface-400 dark:bg-surface-600',
  [VizTone.Brand]: 'bg-primary-600 dark:bg-primary-400',
  [VizTone.Accent]: 'bg-accent-500 dark:bg-accent-400',
  [VizTone.Positive]: 'bg-emerald-500 dark:bg-emerald-400',
  [VizTone.Negative]: 'bg-red-500 dark:bg-red-400',
  [VizTone.Warning]: 'bg-amber-500 dark:bg-amber-400',
};
