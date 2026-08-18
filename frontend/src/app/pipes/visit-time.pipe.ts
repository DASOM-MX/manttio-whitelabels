import { Pipe, PipeTransform } from '@angular/core';

const TIME = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Clock time of an ISO stamp in the **device's** timezone — the technician is
 *  physically where the visit is, so their phone's clock is the site's clock.
 *  Returns '' for absent/invalid input so templates render cleanly. */
@Pipe({ name: 'visitTime', standalone: true, pure: true })
export class VisitTimePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : TIME.format(d);
  }
}
