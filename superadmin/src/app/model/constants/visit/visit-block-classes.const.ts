import { VisitStatus } from '../../enums/visit/visit-status.enum';

/** The solid surface of a visit block in the time grid (12 §3) — merged onto the
 *  block's static layout classes via `[class]`. Also dresses the mobile agenda
 *  row, which is the same visit in a list instead of on an axis.
 *
 *  Scheduled = primary tint (the live plan), **in_progress = amber (the job is
 *  happening right now, and that is the one thing office scans for)**, completed
 *  = green (served), closed = muted with the title struck through — visibly
 *  dead, but its reason still one click away.
 *
 *  The planned **ghost** has no entry here on purpose: it is the same faint
 *  dashed outline whatever the status, because what it says is "this is where
 *  the booking was", not "this is how the visit ended". */
// `primary` and `surface` are the brand scales (tailwind.config): steps 0…1000
// **by 100**, and nothing between. A `-50` or `-950` compiles to no CSS at all
// and fails silently — which is exactly how the calendar shipped with an
// invisible "today" column. Stock palettes (amber, green) keep their own 50/950.
export const VISIT_BLOCK_CLASSES: Record<VisitStatus, string> = {
  [VisitStatus.Scheduled]:
    'border-primary-300 bg-primary-100 text-primary-900 hover:bg-primary-200 ' +
    'dark:border-primary-700 dark:bg-primary-1000 dark:text-primary-100 dark:hover:bg-primary-900',
  [VisitStatus.InProgress]:
    'border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 ' +
    'dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100 dark:hover:bg-amber-900',
  [VisitStatus.Completed]:
    'border-green-300 bg-green-50 text-green-900 hover:bg-green-100 ' +
    'dark:border-green-700 dark:bg-green-950 dark:text-green-100 dark:hover:bg-green-900',
  [VisitStatus.Closed]:
    'border-surface-300 bg-surface-100 text-surface-500 line-through hover:bg-surface-200 ' +
    'dark:border-surface-600 dark:bg-surface-900 dark:text-surface-400 dark:hover:bg-surface-800',
};
