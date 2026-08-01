import { ServiceTaxRate } from '../../services/enums/services.enum';

// Line arithmetic for order totals (19 §5). Deliberately identical to the
// quotation's (`quotations/utils/quotation-totals.ts`), down to the rounding
// order — an order inherits its quote's frozen snapshots, and the two
// disagreeing by a centavo would defeat the freeze both are built on.
//
// Rewritten 2026-07-31 (line model v2): this used to parse money as
// `Number(money) * 100` — a float, the very thing exact-decimal strings exist
// to avoid — and multiply by an integer quantity. Money is now integer
// **cents**, quantity integer **thousandths**, and the cross product runs in
// BigInt because cents × thousandths overflows 2^53 within column bounds.

const toCents = (money: string): number => {
  const [whole = '0', frac = ''] = money.trim().split('.');
  return Number(whole) * 100 + Number(`${frac}00`.slice(0, 2));
};

const toMilli = (quantity: string): number => {
  const [whole = '0', frac = ''] = quantity.trim().split('.');
  return Number(whole) * 1000 + Number(`${frac}000`.slice(0, 3));
};

const fromCents = (cents: number): string =>
  `${Math.trunc(cents / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;

/** IVA as an integer percent, never a 0.16 float. `Iva0` (tasa cero) and
 *  `Exento` both compute to 0 MXN — they differ in CFDI treatment, not
 *  arithmetic, and facturación (09) is where that distinction earns its keep. */
const TAX_PERCENT: Record<ServiceTaxRate, number> = {
  [ServiceTaxRate.Iva16]: 16,
  [ServiceTaxRate.Iva8]: 8,
  [ServiceTaxRate.Iva0]: 0,
  [ServiceTaxRate.Exento]: 0,
};

export interface MoneyTotals {
  /** Σ pre-discount importes — CFDI's SubTotal. */
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
}

interface LineAmountInput {
  unitPrice: string;
  quantity: string;
  taxRate: ServiceTaxRate;
  discountAmount: string;
}

interface LineCents {
  subtotal: number;
  discount: number;
  tax: number;
}

/** `unitPrice × quantity` rounded half-up to the centavo — the line's Importe,
 *  and the only place a fractional-cent value can appear (a decimal quantity
 *  makes cents × thousandths land between centavos). One rounding per line,
 *  before anything sums, is the CFDI per-concepto rule. */
const importeCents = (line: Pick<LineAmountInput, 'unitPrice' | 'quantity'>): number =>
  Number((BigInt(toCents(line.unitPrice)) * BigInt(toMilli(line.quantity)) + 500n) / 1000n);

/** Tax is rounded **per line**, on the NET base (importe − descuento): that's
 *  how the invoice will compute it (rates differ per line, so there is no
 *  single rate to apply to a grand subtotal), and matching here keeps order and
 *  CFDI totals from disagreeing by a centavo. */
const lineCents = (line: LineAmountInput): LineCents => {
  const subtotal = importeCents(line);
  const discount = toCents(line.discountAmount);
  return {
    subtotal,
    discount,
    tax: Math.round(((subtotal - discount) * (TAX_PERCENT[line.taxRate] ?? 0)) / 100),
  };
};

export const lineAmounts = (line: LineAmountInput): MoneyTotals => {
  const { subtotal, discount, tax } = lineCents(line);
  return {
    subtotal: fromCents(subtotal),
    discount: fromCents(discount),
    tax: fromCents(tax),
    total: fromCents(subtotal - discount + tax),
  };
};

export const orderAmounts = (lines: LineAmountInput[]): MoneyTotals => {
  const summed = lines.reduce(
    (acc, line) => {
      const { subtotal, discount, tax } = lineCents(line);
      return {
        subtotal: acc.subtotal + subtotal,
        discount: acc.discount + discount,
        tax: acc.tax + tax,
      };
    },
    { subtotal: 0, discount: 0, tax: 0 },
  );
  return {
    subtotal: fromCents(summed.subtotal),
    discount: fromCents(summed.discount),
    tax: fromCents(summed.tax),
    total: fromCents(summed.subtotal - summed.discount + summed.tax),
  };
};

/** `discountAmount ≤ importe` — past that the tax base goes negative. */
export const discountExceedsLine = (line: LineAmountInput): boolean =>
  toCents(line.discountAmount) > importeCents(line);
