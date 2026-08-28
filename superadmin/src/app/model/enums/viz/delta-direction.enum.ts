/** Which way a KPI delta points (23 CP-3) — the arrow glyph, and by default
 *  the pill's color. It is a direction and not a boolean because `Flat` is a
 *  real state: a period that matched the last one reads neutral, not green.
 *
 *  The default mapping is the fixed semantic set (Up → emerald, Down → red,
 *  Flat → neutral). Metrics where falling is the win — overdue follow-ups,
 *  churn — keep the honest arrow and override the color instead, via
 *  `KpiDelta.tone`. */
export enum DeltaDirection {
  Up = 'up',
  Down = 'down',
  Flat = 'flat',
}
