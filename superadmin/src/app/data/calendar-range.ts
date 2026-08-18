import { CalendarView } from '../model/enums/calendar/calendar-view.enum';
import { addDays, addMonths, startOfDay, startOfMonth, startOfWeek, startOfYear } from './utils';

/** What each view asks the API for, and how its arrows step (12 §3). Pure date
 *  math, kept out of the page for the same reason the block geometry is: it is
 *  the part that is easy to get subtly wrong and worth reading on its own. */

export interface CalendarRange {
  from: Date;
  /** Exclusive — every range is `[from, to)`, so consecutive ranges tile
   *  without overlapping and a visit is never loaded into two of them. */
  to: Date;
}

/** A month grid is always **six** rows, never five or six depending on the
 *  month. A grid that changes height as you page through the year makes every
 *  row jump under the cursor; a fixed 42-day window costs at most one mostly
 *  empty row. 42 always suffices: 31 days plus at most 6 leading is 37. */
const MONTH_GRID_DAYS = 42;

/** The first cell of a month grid: the Monday on or before the 1st. */
export const monthGridStart = (anchor: Date): Date => startOfWeek(startOfMonth(anchor));

/** The window a view loads. Month pads out to the whole grid so the borrowed
 *  days from the neighbouring months carry their visits too — a grid that drew
 *  them empty would be lying about the 1st of next month. */
export const rangeForView = (view: CalendarView, anchor: Date): CalendarRange => {
  switch (view) {
    case CalendarView.Day: {
      const from = startOfDay(anchor);
      return { from, to: addDays(from, 1) };
    }
    case CalendarView.Month: {
      const from = monthGridStart(anchor);
      return { from, to: addDays(from, MONTH_GRID_DAYS) };
    }
    case CalendarView.Year: {
      const from = startOfYear(anchor);
      return { from, to: new Date(anchor.getFullYear() + 1, 0, 1) };
    }
    case CalendarView.Week:
    default: {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 7) };
    }
  }
};

/** Where the prev/next arrows land: each view steps by its own unit, so "next"
 *  always means the next thing you are looking at. */
export const stepAnchor = (view: CalendarView, anchor: Date, direction: 1 | -1): Date => {
  switch (view) {
    case CalendarView.Day:
      return addDays(anchor, direction);
    case CalendarView.Month:
      return startOfMonth(addMonths(startOfMonth(anchor), direction));
    case CalendarView.Year:
      return new Date(anchor.getFullYear() + direction, 0, 1);
    case CalendarView.Week:
    default:
      return addDays(startOfWeek(anchor), direction * 7);
  }
};
