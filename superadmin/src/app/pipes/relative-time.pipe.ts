import { Pipe, PipeTransform } from '@angular/core';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** ISO date → short Spanish relative time ("hace 3 días"). Pure — re-runs
 *  only when the input changes; timeline rows are immutable snapshots. */
@Pipe({ name: 'relativeTime' })
export class RelativeTimePipe implements PipeTransform {
  transform(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return iso;
    const diff = Date.now() - then;
    if (diff < MINUTE) return 'hace un momento';
    if (diff < HOUR) return `hace ${Math.floor(diff / MINUTE)} min`;
    if (diff < DAY) return `hace ${Math.floor(diff / HOUR)} h`;
    if (diff < 30 * DAY) return `hace ${Math.floor(diff / DAY)} d`;
    return iso.slice(0, 10);
  }
}
