/** Chip identity dots: a stable per-technician color, hash-picked from this
 *  fixed palette by user id (05 ask — hash-derived in v1, a real per-user
 *  color assignment can supersede it). Unassigned visits render a hollow dot
 *  instead and never consume a palette slot. */
export const TECHNICIAN_DOT_PALETTE: string[] = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-lime-600',
  'bg-fuchsia-500',
];
