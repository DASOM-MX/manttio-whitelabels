import { HttpParams } from '@angular/common/http';

export type Query = Record<string, string | number | boolean | undefined | null>;

export const toParams = (q?: Query): HttpParams | undefined => {
  if (!q) return undefined;
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    p = p.set(k, String(v));
  }
  return p;
};

/** `YYYY-MM-DD` from local calendar fields — deliberately **not**
 *  `toISOString().slice(0, 10)`, which converts to UTC first and lands a date
 *  picked at local midnight on the previous day for any tenant east of
 *  Greenwich. Calendar dates (fecha compromiso, vigencia) must not shift with
 *  the viewer. */
export const toCalendarDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

/** Whether a `YYYY-MM-DD` calendar date is strictly before today (local).
 *  Lexicographic compare is exact for the fixed-width format — no Date parsing,
 *  no timezone drift. */
export const isCalendarDatePast = (date: string): boolean => date < toCalendarDate(new Date());

/** The local Monday that opens `date`'s week (the calendar's unit of view),
 *  at local midnight. `getDay()` is 0-Sunday, so Sunday belongs to the week
 *  that started six days earlier. */
export const startOfWeek = (date: Date): Date => {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
};

/** Local-field day arithmetic — never millisecond math, which a DST boundary
 *  would put an hour off local midnight. */
export const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Local midnight of `date` — the anchor every calendar range is built from. */
export const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** The 1st of `date`'s month, at local midnight. */
export const startOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1);

/** Month arithmetic that never rolls over: adding a month to 31 Jan lands on
 *  28/29 Feb, not 2/3 March. `new Date(y, m + n, 31)` would silently overflow,
 *  which in a calendar means a "next month" button that skips one. */
export const addMonths = (date: Date, months: number): Date => {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
};

/** The 1st of January of `date`'s year, at local midnight. */
export const startOfYear = (date: Date): Date => new Date(date.getFullYear(), 0, 1);

/** Minutes as people say them: `45 min`, `1 h`, `2 h 30 min`. Used wherever a
 *  visit's planned or real length is written out — the block's tooltip, the
 *  agenda row, the dialog's Planeado vs Real. */
export const formatDurationMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

/** Extract a human-readable message from a thrown value. Tries the Angular
 *  `HttpErrorResponse` shape (`err.error.message`) first, then `Error.message`,
 *  then falls back to the supplied default. */
export const errorMessage = (err: unknown, fallback: string): string => {
  if (err && typeof err === 'object' && 'error' in err) {
    const inner = (err as { error?: { message?: string } }).error;
    if (inner?.message) return inner.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
};

/** The stable snake_case `error` code of a backend error envelope
 *  (`{ error: 'code', message? }`), when the thrown value carries one —
 *  for branching on *behavior* (copy stays `errorMessage`-verbatim). */
export const errorCode = (err: unknown): string | undefined => {
  if (err && typeof err === 'object' && 'error' in err) {
    const inner = (err as { error?: { error?: string } }).error;
    if (typeof inner?.error === 'string') return inner.error;
  }
  return undefined;
};
