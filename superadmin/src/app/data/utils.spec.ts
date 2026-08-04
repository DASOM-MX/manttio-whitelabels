import {
  addDays,
  addMonths,
  formatDurationMinutes,
  isCalendarDatePast,
  startOfWeek,
  toCalendarDate,
} from './utils';

/** Specs for the local-field date helpers the calendar leans on. The point of
 *  every one is the edge its doc comment warns about — overflow, weekday zero
 *  being Sunday, UTC drift — so that is what gets asserted. */

describe('addMonths', () => {
  it('lands on the short month’s last day instead of overflowing', () => {
    expect(addMonths(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
    expect(addMonths(new Date(2024, 0, 31), 1)).toEqual(new Date(2024, 1, 29));
    expect(addMonths(new Date(2026, 4, 31), 1)).toEqual(new Date(2026, 5, 30));
  });

  it('keeps the day where it fits', () => {
    expect(addMonths(new Date(2026, 7, 15), 1)).toEqual(new Date(2026, 8, 15));
    expect(addMonths(new Date(2026, 7, 15), 12)).toEqual(new Date(2027, 7, 15));
    expect(addMonths(new Date(2026, 7, 15), -1)).toEqual(new Date(2026, 6, 15));
  });
});

describe('startOfWeek', () => {
  it('is Monday-first — Sunday closes a week, it does not open one', () => {
    expect(startOfWeek(new Date(2026, 7, 9))).toEqual(new Date(2026, 7, 3));
    expect(startOfWeek(new Date(2026, 7, 3))).toEqual(new Date(2026, 7, 3));
    expect(startOfWeek(new Date(2026, 7, 5, 17, 30))).toEqual(new Date(2026, 7, 3));
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries by calendar days', () => {
    expect(addDays(new Date(2026, 7, 31), 1)).toEqual(new Date(2026, 8, 1));
    expect(addDays(new Date(2026, 0, 1), -1)).toEqual(new Date(2025, 11, 31));
  });
});

describe('toCalendarDate', () => {
  it('reads local fields, never the UTC date', () => {
    // 23:59 local stays the local day — `toISOString().slice(0, 10)` would not.
    expect(toCalendarDate(new Date(2026, 7, 5, 23, 59))).toBe('2026-08-05');
  });
});

describe('isCalendarDatePast', () => {
  it('compares calendar dates lexicographically', () => {
    expect(isCalendarDatePast('1999-01-01')).toBe(true);
    expect(isCalendarDatePast('2999-01-01')).toBe(false);
  });
});

describe('formatDurationMinutes', () => {
  it('writes minutes as people say them', () => {
    expect(formatDurationMinutes(45)).toBe('45 min');
    expect(formatDurationMinutes(60)).toBe('1 h');
    expect(formatDurationMinutes(90)).toBe('1 h 30 min');
    expect(formatDurationMinutes(150)).toBe('2 h 30 min');
    expect(formatDurationMinutes(0)).toBe('0 min');
  });
});
