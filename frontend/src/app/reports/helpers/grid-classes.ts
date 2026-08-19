import type { TemplateColumns } from '../../data/types/report-template/template-columns.type';

/** Section `columns` (the desktop count) → the full grid class string.
 *
 *  A phone always gets one column: the count is the *ceiling*, not the fixed
 *  layout. Every class is spelled out literally because Tailwind's JIT scans
 *  source text — an interpolated `lg:grid-cols-${n}` would never be emitted.
 *  This lookup is the single seam a future per-breakpoint override extends. */
export const GRID_CLASSES: Record<number, string> = {
  1: 'grid grid-cols-1 gap-x-8 gap-y-7',
  2: 'grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-7',
  3: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-7',
};

/** Resolve section columns to grid classes, defaulting to 1-column. */
export const gridClassesForColumns = (columns: TemplateColumns): string =>
  GRID_CLASSES[columns] ?? GRID_CLASSES[1];
