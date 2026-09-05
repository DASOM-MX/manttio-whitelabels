import type { ServiceTaxRate } from '../../../model/enums/service/service-tax-rate.enum';

/** A line as frozen onto the quotation (backend `PortalQuotationLine`, 04 §5)
 *  — the catalog service's name, uom, qty and price at the moment it was
 *  committed. `uom` renders as-is: the backend's `ServiceUom` values are
 *  already Spanish display words ('hora', 'pieza', …), so no label map is
 *  needed for a read-only cell.
 *
 *  There is no per-line total on this wire shape — CFDI's per-concepto
 *  rounding is exact-decimal BigInt arithmetic done once, server-side
 *  (`quotation-totals.ts`); reimplementing it here to satisfy 04 §5's "line
 *  total" wording would risk a one-centavo mismatch against the document the
 *  customer already has as a PDF. Only the document's own `total` (on
 *  `PortalQuotationDetail`) is rendered. */
export interface PortalQuotationLine {
  id: string;
  serviceName: string;
  description: string | null;
  uom: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxRate: ServiceTaxRate;
}
