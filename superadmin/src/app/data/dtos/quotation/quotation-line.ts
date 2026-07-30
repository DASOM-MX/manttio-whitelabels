import type { ServiceTaxRate, ServiceUom } from '../service';

/** A frozen line: name/price/uom/taxRate are snapshots taken at creation
 *  (20 §1) — from the catalog when `serviceId` is present, from the staff-typed
 *  fields when it isn't (an **off-catalog** line, decided 2026-07-29). Money
 *  stays a **string** end-to-end — the column is `numeric(12,2)` and a JSON
 *  float would round pesos. `quantity` is a decimal string (`numeric(12,3)`,
 *  same date) for the same reason. */
export interface QuotationLine {
  id: string;
  /** Absent = off-catalog: no catalog row to trace back to. */
  serviceId?: string;
  serviceName: string;
  description?: string;
  unitPrice: string;
  uom: ServiceUom;
  taxRate: ServiceTaxRate;
  quantity: string;
  /** Frozen amount, never a percent (decided 2026-07-29) — CFDI's per-concepto
   *  `Descuento`. `'0.00'` when none. */
  discountAmount: string;
  /** `unitPrice × quantity` (pre-discount — CFDI's Importe), computed
   *  server-side; no column exists. */
  lineSubtotal: string;
}
