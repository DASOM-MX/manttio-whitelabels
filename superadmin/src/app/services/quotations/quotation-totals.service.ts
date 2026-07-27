import { Injectable } from '@angular/core';
import { ServiceTaxRate } from '../../data/dtos/service';
import type { QuotationTotals } from '../../data/dtos/quotation/quotation-totals';

/** IVA as an integer percent, never a 0.16 float. `Iva0` and `Exento` both add
 *  0 and stay distinct upstream — CFDI renders them differently. */
const IVA_PERCENT: Record<ServiceTaxRate, number> = {
  [ServiceTaxRate.Iva16]: 16,
  [ServiceTaxRate.Iva8]: 8,
  [ServiceTaxRate.Iva0]: 0,
  [ServiceTaxRate.Exento]: 0,
};

/** The fields a total needs — deliberately not a saved line, because the
 *  builder totals rows that do not exist server-side yet. */
export interface TotalableLine {
  unitPrice: string;
  quantity: number;
  taxRate: ServiceTaxRate;
}

/** The builder's running subtotal / IVA / total (20 §8).
 *
 *  This is a **deliberate duplicate** of the backend's `quotation-totals.ts`,
 *  down to the rounding order: the lines being priced have not been saved, so
 *  there is no server figure to show, and a preview that disagrees with the
 *  saved quote by a centavo is worse than no preview at all. Any change to the
 *  backend arithmetic has to land here in the same PR.
 *
 *  All money is integer **cents**. `numeric(12,2)` arrives as an exact decimal
 *  string and must leave as one; doing this in floats reintroduces exactly the
 *  rounding the string representation exists to prevent. */
@Injectable({ providedIn: 'root' })
export class QuotationTotalsService {
  lineSubtotal(line: TotalableLine): string {
    return this.fromCents(this.toCents(line.unitPrice) * line.quantity);
  }

  /** IVA is summed **per line**, rounding each before adding, because rates
   *  differ per line and CFDI rounds per concepto. Rounding the grand total
   *  instead can differ by a centavo from what the server stores. */
  totals(lines: TotalableLine[]): QuotationTotals {
    let subtotalCents = 0;
    let ivaCents = 0;
    for (const line of lines) {
      const lineCents = this.toCents(line.unitPrice) * line.quantity;
      subtotalCents += lineCents;
      ivaCents += Math.round((lineCents * IVA_PERCENT[line.taxRate]) / 100);
    }
    return {
      subtotal: this.fromCents(subtotalCents),
      iva: this.fromCents(ivaCents),
      total: this.fromCents(subtotalCents + ivaCents),
    };
  }

  private toCents(amount: string): number {
    const [whole = '0', frac = ''] = amount.trim().split('.');
    return Number(whole) * 100 + Number(`${frac}00`.slice(0, 2));
  }

  private fromCents(cents: number): string {
    return `${Math.trunc(cents / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
  }
}
