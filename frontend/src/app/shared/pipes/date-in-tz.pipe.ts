import { Pipe, PipeTransform } from '@angular/core';

/** Format style — mirrors the subset of Angular DatePipe presets we actually use
 *  in the report views, so swapping `| date:'mediumDate'` → `| dateInTz:tz:'mediumDate'`
 *  drops in without rethinking format strings. */
export type DateInTzFormat = 'short' | 'shortDate' | 'mediumDate' | 'medium' | 'long' | 'longDate';

const OPTIONS: Record<DateInTzFormat, Intl.DateTimeFormatOptions> = {
  short: { dateStyle: 'short', timeStyle: 'short' },
  shortDate: { dateStyle: 'short' },
  mediumDate: { dateStyle: 'medium' },
  medium: { dateStyle: 'medium', timeStyle: 'medium' },
  long: { dateStyle: 'long', timeStyle: 'short' },
  longDate: { dateStyle: 'long' },
};

/** Formats a date in a specific IANA timezone (typically the report customer's TZ).
 *  Returns '' for null/undefined/invalid input so templates render cleanly. */
@Pipe({ name: 'dateInTz', standalone: true, pure: true })
export class DateInTzPipe implements PipeTransform {
  transform(
    value: Date | string | number | null | undefined,
    timezone: string | null | undefined,
    format: DateInTzFormat = 'medium',
  ): string {
    if (value === null || value === undefined || value === '') return '';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const tz = timezone || 'America/Mexico_City';
    try {
      return new Intl.DateTimeFormat('es-MX', { ...OPTIONS[format], timeZone: tz }).format(d);
    } catch {
      // Unknown IANA zone — fall back to the default so we never throw in a template.
      return new Intl.DateTimeFormat('es-MX', OPTIONS[format]).format(d);
    }
  }
}
