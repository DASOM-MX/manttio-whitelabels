import type { ServiceTaxRate, ServiceUom } from '../service';

/** A frozen line: name/price/uom/taxRate are snapshots of the catalog at
 *  creation (20 §1), so a repriced or soft-deleted service still renders on the
 *  quotes that sold it. Money stays a **string** end-to-end — the column is
 *  `numeric(12,2)` and a JSON float would round pesos. */
export interface QuotationLine {
  id: string;
  serviceId: string;
  serviceName: string;
  description?: string;
  unitPrice: string;
  uom: ServiceUom;
  taxRate: ServiceTaxRate;
  quantity: number;
  /** `unitPrice × quantity`, computed server-side; no column exists. */
  lineSubtotal: string;
}
