/** The grid's left axis: every hour of the day, `00:00` through `23:00`. The
 *  full 24 hours by design (12 §3) — the shop takes emergency calls at midnight,
 *  and a calendar that starts at 08:00 cannot show them at all. */
export const HOUR_LABELS: string[] = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, '0')}:00`,
);
