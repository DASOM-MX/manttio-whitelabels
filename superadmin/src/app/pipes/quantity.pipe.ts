import { Pipe, PipeTransform } from '@angular/core';

/** `numeric(12,3)` arrives as `"2.000"` / `"1.500"` — correct, but a table full
 *  of phantom decimals reads as noise. Trims trailing zeros (and a bare dot):
 *  `"2.000"` → `"2"`, `"1.500"` → `"1.5"`. Display only — payloads keep the
 *  exact string. */
@Pipe({ name: 'quantity' })
export class QuantityPipe implements PipeTransform {
  transform(quantity: string): string {
    return quantity.includes('.') ? quantity.replace(/\.?0+$/, '') : quantity;
  }
}
