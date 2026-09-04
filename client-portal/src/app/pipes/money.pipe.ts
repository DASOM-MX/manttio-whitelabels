import { Pipe, PipeTransform } from '@angular/core';

/** Renders a `numeric(12,2)` string from the API as MXN. Stays a string
 *  end-to-end on the wire — this is the single place it crosses to `Number`,
 *  for display only. */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '—';
    return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  }
}
