/** Full month names, indexed by `Date#getMonth()`. Hand-rolled for the same
 *  reason as the short labels — the app registers no Angular locale, so
 *  `date: 'MMMM'` would render English. Used where there is room to spell it
 *  out: the month view's own title. */
export const MONTH_LABELS: string[] = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
