import { VisitStatus } from '../../enums/visit/visit-status.enum';

/** Week-grid chip surfaces per status (12 §3): scheduled = primary tint (the
 *  live plan), completed = green (served), closed = muted with the title
 *  struck through — visibly dead, but its reason still one hover away. Merged
 *  onto the chip's static layout classes via `[class]`. */
export const VISIT_CHIP_CLASSES: Record<VisitStatus, string> = {
  [VisitStatus.Scheduled]:
    'border-primary-200 bg-primary-50 text-primary-900 hover:bg-primary-100 ' +
    'dark:border-primary-800 dark:bg-primary-950 dark:text-primary-100 dark:hover:bg-primary-900',
  [VisitStatus.Completed]:
    'border-green-200 bg-green-50 text-green-900 hover:bg-green-100 ' +
    'dark:border-green-800 dark:bg-green-950 dark:text-green-100 dark:hover:bg-green-900',
  [VisitStatus.Closed]:
    'border-surface-200 bg-surface-50 text-surface-500 line-through hover:bg-surface-100 ' +
    'dark:border-surface-700 dark:bg-surface-900 dark:text-surface-400 dark:hover:bg-surface-800',
};
