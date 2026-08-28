import { VizTone } from '../../enums/viz/viz-tone.enum';

/** Text classes for a toned numeral or label — every pair clears 4.5:1 in
 *  its own mode against the card fill (`white` / `surface-900`), measured
 *  against the *neutral default* brand, so a tenant's hue is never what saves
 *  it (23 § Verification).
 *
 *  `Neutral` is the plain value color, the one a KPI uses when its number has
 *  no direction — most of them. */
export const VALUE_TONE_CLASSES: Record<VizTone, string> = {
  [VizTone.Neutral]: 'text-surface-1000 dark:text-surface-0',
  [VizTone.Brand]: 'text-primary-700 dark:text-primary-300',
  [VizTone.Accent]: 'text-accent-700 dark:text-accent-300',
  [VizTone.Positive]: 'text-emerald-700 dark:text-emerald-400',
  [VizTone.Negative]: 'text-red-600 dark:text-red-400',
  [VizTone.Warning]: 'text-amber-700 dark:text-amber-400',
};
