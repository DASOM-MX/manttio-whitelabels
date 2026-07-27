import { ServiceTaxRate } from '../../../data/dtos/service';

/** IVA multiplier per catalog rate — the builder's client-side running total
 *  (mirrors the backend's `order-money.ts`; the API resolves the authoritative
 *  totals from its own snapshots). `Iva0` and `Exento` both compute 0 — they
 *  differ in CFDI treatment, not arithmetic. */
export const TAX_RATE_MULTIPLIERS: Record<ServiceTaxRate, number> = {
  [ServiceTaxRate.Iva16]: 0.16,
  [ServiceTaxRate.Iva8]: 0.08,
  [ServiceTaxRate.Iva0]: 0,
  [ServiceTaxRate.Exento]: 0,
};
