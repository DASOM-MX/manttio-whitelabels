import { Pipe, PipeTransform } from '@angular/core';

const DAY = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

/** Short day label ("Lun, 4 de ago") in the device's timezone — see
 *  `visitTime` for why device-local is the right zone for field screens.
 *  Sentence-cased here, NOT with CSS `capitalize` — that would also
 *  capitalize the Spanish "de" ("4 De Ago"). */
@Pipe({ name: 'visitDay', standalone: true, pure: true })
export class VisitDayPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const label = DAY.format(d);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
}
