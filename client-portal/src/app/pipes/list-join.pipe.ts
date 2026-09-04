import { Pipe, PipeTransform } from '@angular/core';

/** Joins a string list for display (no method calls in templates) — the
 *  reports list's equipment/site column, and any future list-typed cell. */
@Pipe({ name: 'listJoin' })
export class ListJoinPipe implements PipeTransform {
  transform(items: string[] | null | undefined, fallback = '—'): string {
    return items && items.length ? items.join(', ') : fallback;
  }
}
