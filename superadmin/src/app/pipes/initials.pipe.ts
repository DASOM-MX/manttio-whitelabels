import { Pipe, PipeTransform } from '@angular/core';

/** First letters of the first two words — feeds the entity-row avatar chip
 *  (soft-UI pass 2026-07-22). Pure pipe so tables pay it once per row. */
@Pipe({ name: 'initials' })
export class InitialsPipe implements PipeTransform {
  transform(name: string | null | undefined): string {
    return (name ?? '')
      .trim()
      .split(/\s+/, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('');
  }
}
