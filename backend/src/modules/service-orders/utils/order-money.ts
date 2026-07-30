import { ServiceTaxRate } from '../../services/enums/services.enum';

// Line arithmetic for order totals (19 §5 — the list's total column and the
// order view's per-line + running totals).
//
// All math runs in **integer cents**. `numeric(12,2)` reaches TS as a string
// precisely so no float rounds a peso, and summing parsed floats would undo
// that on the very first `0.1 + 0.2`. Parse once at the edge, add integers,
// format once on the way out.

const toCents = (money: string): number => Math.round(Number(money) * 100);

const fromCents = (cents: number): string => (cents / 100).toFixed(2);

/** IVA multiplier per catalog rate (18 §1). `Iva0` (tasa cero) and `Exento`
 *  both compute to 0 MXN — they differ in CFDI treatment, not arithmetic, and
 *  facturación (09) is where that distinction earns its keep. */
const TAX_MULTIPLIER: Record<ServiceTaxRate, number> = {
  [ServiceTaxRate.Iva16]: 0.16,
  [ServiceTaxRate.Iva8]: 0.08,
  [ServiceTaxRate.Iva0]: 0,
  [ServiceTaxRate.Exento]: 0,
};

export interface MoneyTotals {
  subtotal: string;
  tax: string;
  total: string;
}

interface LineAmountInput {
  unitPrice: string;
  quantity: number;
  taxRate: ServiceTaxRate;
}

interface LineCents {
  subtotal: number;
  tax: number;
}

/** Tax is rounded **per line**, not on the summed subtotal: that's how the
 *  invoice will compute it (rates differ per line, so there is no single rate
 *  to apply to a grand subtotal), and matching here keeps order and CFDI
 *  totals from disagreeing by a centavo. */
const lineCents = (line: LineAmountInput): LineCents => {
  const subtotal = toCents(line.unitPrice) * line.quantity;
  return { subtotal, tax: Math.round(subtotal * (TAX_MULTIPLIER[line.taxRate] ?? 0)) };
};

export const lineAmounts = (line: LineAmountInput): MoneyTotals => {
  const { subtotal, tax } = lineCents(line);
  return { subtotal: fromCents(subtotal), tax: fromCents(tax), total: fromCents(subtotal + tax) };
};

export const orderAmounts = (lines: LineAmountInput[]): MoneyTotals => {
  const summed = lines.reduce(
    (acc, line) => {
      const { subtotal, tax } = lineCents(line);
      return { subtotal: acc.subtotal + subtotal, tax: acc.tax + tax };
    },
    { subtotal: 0, tax: 0 },
  );
  return {
    subtotal: fromCents(summed.subtotal),
    tax: fromCents(summed.tax),
    total: fromCents(summed.subtotal + summed.tax),
  };
};
