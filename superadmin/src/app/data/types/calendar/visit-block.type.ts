import type { Visit } from '../../dtos/visit';

/** One rectangle on the 24-hour axis, already reduced to the two numbers CSS
 *  needs. Percentages, not pixels: the column's own height sets the scale, so
 *  the same math works at any row height and on any screen. */
export interface VisitRect {
  /** Distance from 00:00 as a percentage of the day. */
  top: number;
  /** Span as a percentage of the day, clamped so a block never runs past 24:00. */
  height: number;
}

/** A visit as the grid draws it (12 §3).
 *
 *  Two rectangles, deliberately named for what they *say* rather than for
 *  planned/actual: `solid` is the visit as it stands — the real times once a
 *  technician has recorded them, the booking until then — and `ghost` is the
 *  booking kept alongside as a faint dashed outline, present **only** when there
 *  is a real time to contrast it against. That is the whole reason the actuals
 *  are captured: an over- or under-run becomes readable across a week without
 *  opening anything, while a visit nobody has touched yet draws once, plainly. */
export interface VisitBlock {
  visit: Visit;
  solid: VisitRect;
  ghost?: VisitRect;
  /** The block's *length* is a projection, not a record — the visit has a real
   *  start but no real duration, so `solid` runs to the expected end. Drawn
   *  open-bottomed so it never claims a finish time nobody reported.
   *
   *  Two visits land here, and naming it for the missing duration rather than
   *  for `in_progress` is what makes it cover both: one still being performed,
   *  and one office marked served from the admin — which stamps no end, because
   *  there was no tap to report. The second is a completed visit and would look
   *  like a lie with a closed rectangle. */
  openEnded: boolean;
  /** Horizontal share of the day column, as percentages — how visits that
   *  overlap in time split the width between them. */
  left: number;
  width: number;
  /** How many visits that overlap group had to fit side by side. The label
   *  compacts once a block is too narrow to read. */
  laneCount: number;
}

/** One day column of the time-axis grid — seven of these in the week view, one
 *  in the day view. */
export interface CalendarDay {
  /** `YYYY-MM-DD` — the column's identity and `track` key. */
  key: string;
  /** `Lun`, `Mar`, … */
  label: string;
  dayOfMonth: number;
  isToday: boolean;
  blocks: VisitBlock[];
}

/** One cell of the month grid. No time axis here: a month of 24-hour columns
 *  would be unreadable, so a day is a list of what is on it. Days from the
 *  neighbouring months fill the grid's corners and are dimmed rather than
 *  hidden — a visit on the 1st of next month is still worth seeing when you are
 *  looking at how the end of this one fills up. */
export interface MonthDayCell {
  /** `YYYY-MM-DD` — identity, `track` key, and the anchor a click navigates to. */
  key: string;
  dayOfMonth: number;
  isToday: boolean;
  /** False for the leading/trailing days borrowed from the adjacent months. */
  inMonth: boolean;
  /** The visits the cell actually draws, earliest first — already sliced, so
   *  the template neither slices nor counts (01 Angular: no calls in bindings). */
  shown: Visit[];
  /** How many more the day holds beyond `shown`. Zero renders nothing. */
  overflow: number;
}

/** One day of a mini-month in the year overview. No visit data beyond "is there
 *  anything" — at this size a day is four pixels of tint, and a count nobody can
 *  read is just noise. */
export interface YearMiniDay {
  /** `YYYY-MM-DD` — `track` key. */
  key: string;
  dayOfMonth: number;
  /** False for the days borrowed from the adjacent months, which are dimmed. */
  inMonth: boolean;
  isToday: boolean;
  hasVisits: boolean;
}

/** One cell of the year overview: a month, drawn as a miniature of the month
 *  view. The shape of the year is legible from where the tinted days cluster —
 *  which is the question the year answers — without a single number on screen. */
export interface YearMonthCell {
  /** `YYYY-MM` — identity and `track` key. */
  key: string;
  /** `enero`, `febrero`, … */
  label: string;
  /** Anchor date (the 1st) a click navigates to. */
  date: string;
  isCurrentMonth: boolean;
  /** Six weeks, same fixed grid the month view uses. */
  days: YearMiniDay[];
}
