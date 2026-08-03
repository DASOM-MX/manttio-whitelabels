/** How much of the calendar is on screen at once (12 §3, owner 2026-08-03).
 *
 *  The week grid is still the working view — it is the only one that draws
 *  visits on a real time axis, and scheduling happens against clock time. The
 *  other three exist for the questions a week cannot answer: what is happening
 *  today in detail, how the month is filling up, and which months of the year
 *  are heavy.
 *
 *  Cycle order is the reading order of the label click: each step zooms out, and
 *  `Year` wraps back to `Day`. */
export enum CalendarView {
  Day = 'day',
  Week = 'week',
  Month = 'month',
  Year = 'year',
}

/** The cycle the corner label walks, innermost first. */
export const CALENDAR_VIEW_CYCLE: CalendarView[] = [
  CalendarView.Day,
  CalendarView.Week,
  CalendarView.Month,
  CalendarView.Year,
];
