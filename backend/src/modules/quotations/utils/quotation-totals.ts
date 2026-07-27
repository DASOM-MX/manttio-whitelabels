import { ServiceTaxRate } from '../../services/enums/services.enum';

// IVA as an integer percent, never a 0.16 float — see the cents note below.
// `Iva0` and `Exento` both contribute 0 MXN and are still kept apart upstream:
// CFDI renders them differently (Tasa 0.000000 vs Exento), so the distinction
// has to survive as far as 09 even though the arithmetic here can't tell them
// apart (20 §3).
const IVA_PERCENT: Record<ServiceTaxRate, number> = {
  [ServiceTaxRate.Iva16]: 16,
  [ServiceTaxRate.Iva8]: 8,
  [ServiceTaxRate.Iva0]: 0,
  [ServiceTaxRate.Exento]: 0,
};

/** All money here is integer **cents**. `numeric(12,2)` reaches us as an exact
 *  decimal string and must leave the same way; doing the arithmetic in floats
 *  would reintroduce exactly the rounding error the string representation
 *  exists to prevent (0.1 + 0.2 on a 3-line quote is a centavo the client can
 *  see). Parse once at the edge, sum as integers, format once on the way out. */
const toCents = (amount: string): number => {
  const [whole = '0', frac = ''] = amount.trim().split('.');
  return Number(whole) * 100 + Number(`${frac}00`.slice(0, 2));
};

const fromCents = (cents: number): string =>
  `${Math.trunc(cents / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;

/** The frozen fields a total needs — deliberately not the full line row, so
 *  this stays callable from the service layer before the rows exist (on create,
 *  the snapshots are resolved but unsaved). */
export interface TotalableLine {
  unitPrice: string;
  quantity: number;
  taxRate: ServiceTaxRate;
}

export interface QuotationTotals {
  subtotal: string;
  iva: string;
  total: string;
}

/** `unitPrice × quantity` — exact, because both operands are integers once the
 *  price is in cents. */
export const lineSubtotal = (line: TotalableLine): string =>
  fromCents(toCents(line.unitPrice) * line.quantity);

/** Totals are computed from the frozen lines and **never stored** (20 §1): a
 *  stored total is a second source of truth that silently drifts the first time
 *  a line changes.
 *
 *  IVA is summed **per line**, rounding each line before adding, because rates
 *  differ per line (a quote may mix 16% and exento) and CFDI rounds per
 *  concepto. Rounding the grand total instead can differ by a centavo from the
 *  invoice 09 later issues off these same snapshots — and the whole point of
 *  freezing them is that quote and invoice reconcile exactly. */
export const quotationTotals = (lines: TotalableLine[]): QuotationTotals => {
  let subtotalCents = 0;
  let ivaCents = 0;
  for (const line of lines) {
    const lineCents = toCents(line.unitPrice) * line.quantity;
    subtotalCents += lineCents;
    ivaCents += Math.round((lineCents * IVA_PERCENT[line.taxRate]) / 100);
  }
  return {
    subtotal: fromCents(subtotalCents),
    iva: fromCents(ivaCents),
    total: fromCents(subtotalCents + ivaCents),
  };
};
