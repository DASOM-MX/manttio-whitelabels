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

/** All money here is integer **cents**, all quantities integer **thousandths**.
 *  `numeric(12,2)` / `numeric(12,3)` reach us as exact decimal strings and must
 *  leave the same way; doing the arithmetic in floats would reintroduce exactly
 *  the rounding error the string representation exists to prevent (0.1 + 0.2 on
 *  a 3-line quote is a centavo the client can see). Parse once at the edge, sum
 *  as integers, format once on the way out. */
const toCents = (amount: string): number => {
  const [whole = '0', frac = ''] = amount.trim().split('.');
  return Number(whole) * 100 + Number(`${frac}00`.slice(0, 2));
};

/** Decimal quantity (numeric(12,3), decided 2026-07-29) → integer thousandths.
 *  Same edge discipline as `toCents`. */
const toMilli = (quantity: string): number => {
  const [whole = '0', frac = ''] = quantity.trim().split('.');
  return Number(whole) * 1000 + Number(`${frac}000`.slice(0, 3));
};

const fromCents = (cents: number): string =>
  `${Math.trunc(cents / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;

/** The frozen fields a total needs — deliberately not the full line row, so
 *  this stays callable from the service layer before the rows exist (on create,
 *  the snapshots are resolved but unsaved). */
export interface TotalableLine {
  unitPrice: string;
  quantity: string;
  taxRate: ServiceTaxRate;
  discountAmount: string;
}

export interface QuotationTotals {
  subtotal: string;
  discount: string;
  iva: string;
  total: string;
}

/** `unitPrice × quantity`, rounded half-up to the centavo — the line's Importe,
 *  and the **only** place a fractional-cent value can appear (a decimal
 *  quantity makes cents × thousandths land between centavos). One rounding per
 *  line, before anything sums, is the CFDI per-concepto rule.
 *
 *  The cross product runs in BigInt: cents (≤10^12 for numeric(12,2)) ×
 *  thousandths (≤10^12 for numeric(12,3)) overflows 2^53, and a silent float
 *  takeover here is precisely the drift this file exists to prevent. `+ 500n`
 *  then truncating division is half-up — both operands are non-negative by
 *  validation. */
const importeCents = (line: Pick<TotalableLine, 'unitPrice' | 'quantity'>): number =>
  Number((BigInt(toCents(line.unitPrice)) * BigInt(toMilli(line.quantity)) + 500n) / 1000n);

/** The line's Importe (pre-discount, CFDI's meaning). Exposed for the DTO's
 *  `lineSubtotal` and for the discount-ceiling guard in the service layer. */
export const lineSubtotal = (line: Pick<TotalableLine, 'unitPrice' | 'quantity'>): string =>
  fromCents(importeCents(line));

/** Totals are computed from the frozen lines and **never stored** (20 §1): a
 *  stored total is a second source of truth that silently drifts the first time
 *  a line changes.
 *
 *  Mirrors CFDI 4.0 exactly: `SubTotal = Σ Importe` (pre-discount),
 *  `Descuento = Σ per-line discount`, IVA per concepto on the **net** base
 *  (`Importe − Descuento`), rounding each line's importe and IVA once before
 *  adding — rates differ per line (a quote may mix 16% and exento) and CFDI
 *  rounds per concepto. Rounding the grand total instead can differ by a
 *  centavo from the invoice 09 later issues off these same snapshots — and the
 *  whole point of freezing them is that quote and invoice reconcile exactly.
 *  The discount contributes no rounding at all: it is stored as an exact
 *  amount (decided 2026-07-29), never derived from a percent. */
export const quotationTotals = (lines: TotalableLine[]): QuotationTotals => {
  let subtotalCents = 0;
  let discountCents = 0;
  let ivaCents = 0;
  for (const line of lines) {
    const importe = importeCents(line);
    const discount = toCents(line.discountAmount);
    subtotalCents += importe;
    discountCents += discount;
    ivaCents += Math.round(((importe - discount) * IVA_PERCENT[line.taxRate]) / 100);
  }
  return {
    subtotal: fromCents(subtotalCents),
    discount: fromCents(discountCents),
    iva: fromCents(ivaCents),
    total: fromCents(subtotalCents - discountCents + ivaCents),
  };
};

/** `discountAmount ≤ importe` — the ceiling the create/update path enforces
 *  (a discount larger than the line would flip its IVA base negative). */
export const discountExceedsLine = (line: TotalableLine): boolean =>
  toCents(line.discountAmount) > importeCents(line);
