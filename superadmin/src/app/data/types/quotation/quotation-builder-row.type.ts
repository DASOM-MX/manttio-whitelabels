import type { ServiceTaxRate, ServiceUom } from '../../dtos/service';

/** A builder line as the template renders it: the form's own values joined with
 *  the catalog entry they point at, plus the running subtotal.
 *
 *  Materialized in a `computed()` rather than read per-cell, because a template
 *  may not call methods and each row needs four catalog fields the FormArray
 *  does not hold. */
export interface QuotationBuilderRow {
  index: number;
  serviceId: string;
  quantity: number;
  serviceName: string;
  unitPrice: string;
  uom: ServiceUom | null;
  taxRate: ServiceTaxRate | null;
  subtotal: string;
  /** The row points at a service that is no longer in the active catalog —
   *  soft-deleted since the draft was built. Saving would 404, so the row is
   *  flagged and the save disabled rather than failing at the API. */
  missing: boolean;
}
