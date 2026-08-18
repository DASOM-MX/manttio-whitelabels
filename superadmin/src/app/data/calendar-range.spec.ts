import { monthGridStart, rangeForView, stepAnchor } from './calendar-range';
import { CalendarView } from '../model/enums/calendar/calendar-view.enum';

/** Specs for the view windows and arrow steps. Fixed 2026 dates with known
 *  weekdays: Mon 3 Aug, Wed 5 Aug, Sun 9 Aug; June 2026 opens on a Monday,
 *  August on a Saturday. Local-field constructors keep them timezone-proof. */

const d = (month: number, day: number, year = 2026): Date => new Date(year, month, day);

describe('rangeForView', () => {
  it('day: the anchor’s own midnight-to-midnight', () => {
    const { from, to } = rangeForView(CalendarView.Day, d(7, 5));
    expect(from).toEqual(d(7, 5));
    expect(to).toEqual(d(7, 6));
  });

  it('week: Monday through the exclusive next Monday', () => {
    const { from, to } = rangeForView(CalendarView.Week, d(7, 5));
    expect(from).toEqual(d(7, 3));
    expect(to).toEqual(d(7, 10));
  });

  it('week: a Sunday belongs to the week that started six days earlier', () => {
    const { from } = rangeForView(CalendarView.Week, d(7, 9));
    expect(from).toEqual(d(7, 3));
  });

  it('month: the full 42-day grid, padded to the Monday on or before the 1st', () => {
    const { from, to } = rangeForView(CalendarView.Month, d(7, 15));
    expect(from).toEqual(d(6, 27));
    expect(to).toEqual(d(8, 7));
  });

  it('month: no padding when the month opens on a Monday', () => {
    expect(monthGridStart(d(5, 10))).toEqual(d(5, 1));
  });

  it('year: 1 January to the exclusive next 1 January', () => {
    const { from, to } = rangeForView(CalendarView.Year, d(7, 5));
    expect(from).toEqual(d(0, 1));
    expect(to).toEqual(d(0, 1, 2027));
  });

  it('day and week ranges tile — stepping the anchor starts exactly where the last window ended', () => {
    for (const view of [CalendarView.Day, CalendarView.Week]) {
      const current = rangeForView(view, d(7, 5));
      const next = rangeForView(view, stepAnchor(view, d(7, 5), 1));
      expect(next.from).toEqual(current.to);
    }
  });

  it('month ranges deliberately overlap — the borrowed corner days load their visits too', () => {
    const august = rangeForView(CalendarView.Month, d(7, 15));
    const september = rangeForView(CalendarView.Month, stepAnchor(CalendarView.Month, d(7, 15), 1));
    expect(september.from.getTime()).toBeLessThan(august.to.getTime());
  });
});

describe('stepAnchor', () => {
  it('day steps a single day either way', () => {
    expect(stepAnchor(CalendarView.Day, d(7, 5), 1)).toEqual(d(7, 6));
    expect(stepAnchor(CalendarView.Day, d(7, 5), -1)).toEqual(d(7, 4));
  });

  it('week lands on a Monday even from mid-week', () => {
    expect(stepAnchor(CalendarView.Week, d(7, 5), 1)).toEqual(d(7, 10));
    expect(stepAnchor(CalendarView.Week, d(7, 5), -1)).toEqual(d(6, 27));
  });

  it('month never overflows — the 31st does not skip short months', () => {
    expect(stepAnchor(CalendarView.Month, d(7, 31), 1)).toEqual(d(8, 1));
    expect(stepAnchor(CalendarView.Month, d(7, 15), -1)).toEqual(d(6, 1));
  });

  it('year lands on 1 January', () => {
    expect(stepAnchor(CalendarView.Year, d(7, 5), 1)).toEqual(d(0, 1, 2027));
  });
});
