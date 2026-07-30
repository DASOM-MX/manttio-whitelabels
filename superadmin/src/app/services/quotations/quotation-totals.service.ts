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
  quantity: string;
  taxRate: ServiceTaxRate;
  discountAmount: string;
}

/** The builder's running subtotal / descuento / IVA / total (20 §8).
 *
 *  This is a **deliberate duplicate** of the backend's `quotation-totals.ts`,
 *  down to the rounding order: the lines being priced have not been saved, so
 *  there is no server figure to show, and a preview that disagrees with the
 *  saved quote by a centavo is worse than no preview at all. Any change to the
 *  backend arithmetic has to land here in the same PR.
 *
 *  All money is integer **cents**, all quantities integer **thousandths**
 *  (`numeric(12,3)`, decided 2026-07-29). Exact decimal strings in and out;
 *  the one fractional-cent moment — cents × thousandths — rounds half-up
 *  once per line, in BigInt because the cross product can pass 2^53. */
@Injectable({ providedIn: 'root' })
export class QuotationTotalsService {
  lineSubtotal(line: Pick<TotalableLine, 'unitPrice' | 'quantity'>): string {
    return this.fromCents(this.importeCents(line));
  }

  /** CFDI 4.0 shape: `subtotal` = Σ pre-discount importes, `discount` = Σ
   *  per-line discounts (exact amounts, no rounding — decided 2026-07-29), IVA
   *  per line on the **net** base, each rounded before adding, because rates
   *  differ per line and CFDI rounds per concepto. */
  totals(lines: TotalableLine[]): QuotationTotals {
    let subtotalCents = 0;
    let discountCents = 0;
    let ivaCents = 0;
    for (const line of lines) {
      const importe = this.importeCents(line);
      const discount = this.toCents(line.discountAmount);
      subtotalCents += importe;
      discountCents += discount;
      ivaCents += Math.round(((importe - discount) * IVA_PERCENT[line.taxRate]) / 100);
    }
    return {
      subtotal: this.fromCents(subtotalCents),
      discount: this.fromCents(discountCents),
      iva: this.fromCents(ivaCents),
      total: this.fromCents(subtotalCents - discountCents + ivaCents),
    };
  }

  /** The typed discount exceeds the row's importe — the API would 400. */
  discountExceedsLine(line: TotalableLine): boolean {
    return this.toCents(line.discountAmount) > this.importeCents(line);
  }

  /** The % quick-entry (builder-local): converts a percent **once** into the
   *  frozen amount the API stores. Basis points keep 12.5% integer; BigInt for
   *  the same overflow reason as the importe. */
  percentToAmount(line: Pick<TotalableLine, 'unitPrice' | 'quantity'>, percent: number): string {
    const basisPoints = Math.round(percent * 100);
    const cents = Number((BigInt(this.importeCents(line)) * BigInt(basisPoints) + 5000n) / 10000n);
    return this.fromCents(cents);
  }

  /** `unitPrice × quantity` rounded half-up to the centavo — the only rounding
   *  a line's importe ever gets, same as the backend. */
  private importeCents(line: Pick<TotalableLine, 'unitPrice' | 'quantity'>): number {
    return Number(
      (BigInt(this.toCents(line.unitPrice)) * BigInt(this.toMilli(line.quantity)) + 500n) / 1000n,
    );
  }

  private toCents(amount: string): number {
    const [whole = '0', frac = ''] = amount.trim().split('.');
    return Number(whole) * 100 + Number(`${frac}00`.slice(0, 2));
  }

  private toMilli(quantity: string): number {
    const [whole = '0', frac = ''] = quantity.trim().split('.');
    return Number(whole) * 1000 + Number(`${frac}000`.slice(0, 3));
  }

  private fromCents(cents: number): string {
    return `${Math.trunc(cents / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
  }
}
