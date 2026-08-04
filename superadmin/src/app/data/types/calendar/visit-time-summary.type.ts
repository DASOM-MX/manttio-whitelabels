/** Planeado vs Real for one visit (12 §4) — the per-visit read of the numbers
 *  the actuals exist to produce. Durations arrive pre-formatted because the
 *  template must not do arithmetic; the instants stay raw and are rendered with
 *  the `date` pipe where they are shown. */
export interface VisitTimeSummary {
  /** What office booked, e.g. `1 h 30 min`. */
  plannedDuration: string;
  /** What it took. Absent until the pair of stamps exists — a visit completed
   *  from the admin has no recorded length, and inventing one would fabricate
   *  billing data. */
  actualDuration?: string;
  /** The gap, signed and written out: `+25 min`, `−10 min`. Absent whenever
   *  `actualDuration` is. */
  variance?: string;
  /** The job ran long. Drives the tone of the variance, not its sign. */
  over: boolean;
  /** Real length matched the estimate exactly — worth saying plainly rather
   *  than showing `+0 min`. */
  onEstimate: boolean;
}
