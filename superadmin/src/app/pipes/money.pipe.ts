import { Pipe, PipeTransform } from '@angular/core';

/** Renders a `numeric(12,2)` string from the API as MXN.
 *
 *  The value stays a **string** end-to-end — the backend column is exact
 *  decimal and a JSON float would round pesos — so this is the single place
 *  where money crosses to `Number`, for display only. A missing value (an
 *  absent `cost`, e.g. one the API redacted) renders as an em dash, never
 *  as $0.00. */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '—';
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '—';
    return amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  }
}
