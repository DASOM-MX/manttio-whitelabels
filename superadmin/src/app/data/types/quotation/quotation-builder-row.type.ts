import type { ServiceTaxRate, ServiceUom } from '../../dtos/service';

/** A builder line as the template renders it: the form's own values joined with
 *  the snapshot they resolve to — the catalog entry for a catalog row, the
 *  typed-in fields for an off-catalog one — plus the running subtotal.
 *
 *  Materialized in a `computed()` rather than read per-cell, because a template
 *  may not call methods and each row needs snapshot fields the FormArray does
 *  not hold. */
export interface QuotationBuilderRow {
  index: number;
  offCatalog: boolean;
  serviceId: string;
  quantity: number;
  serviceName: string;
  unitPrice: string;
  uom: ServiceUom | null;
  taxRate: ServiceTaxRate | null;
  /** Frozen discount amount as money string ('0.00' when none). */
  discountAmount: string;
  /** Pre-discount importe (CFDI's meaning); '0.00' until the row prices. */
  subtotal: string;
  /** Catalog rows only: the service was soft-deleted since the draft was
   *  built. Saving would 400, so the row is flagged and the save disabled. */
  missing: boolean;
  /** The typed discount exceeds the row's importe — the API would 400. */
  discountTooLarge: boolean;
}
