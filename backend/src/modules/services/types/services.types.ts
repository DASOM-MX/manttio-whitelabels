import type { services } from '../models/services.model';
import type { ServiceTaxRate, ServiceUom } from '../enums/services.enum';

export type ServiceRow = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;

export type UpdateServiceFields = Partial<
  Pick<
    ServiceRow,
    | 'name'
    | 'price'
    | 'cost'
    | 'uom'
    | 'description'
    | 'taxRate'
    | 'satProdServCode'
    | 'satUnitCode'
    | 'isListableInWebsite'
    | 'isPriceVisibleInWebsite'
  >
>;

/** The narrow row the public website query selects — deliberately not
 *  `ServiceRow`, so internal columns can't reach the unauthenticated response. */
export interface PublicServiceRow {
  id: string;
  name: string;
  description: string | null;
  uom: ServiceUom;
  price: string;
  isPriceVisibleInWebsite: boolean;
}

/** What `GET /public/services` returns per entry (18 §4). `price` is present
 *  only when the service opts in — an omitted `price` is the site's cue to
 *  render "Precio a consultar" rather than a number. No tax rate: the website
 *  is a brochure, and quoting IVA there would imply a binding price. */
export interface PublicServiceDTO {
  id: string;
  name: string;
  description?: string;
  uom: ServiceUom;
  price?: string;
}

/** The catalog shape returned to the superadmin (matches its `Service` DTO).
 *  Money fields are strings, never numbers — `numeric` keeps exact decimals and
 *  a JSON float would not. `cost` is present only for back-office readers
 *  (owner/admin/office) — never for technicians. */
export interface ServiceDTO {
  id: string;
  name: string;
  price: string;
  cost?: string;
  uom: ServiceUom;
  description?: string;
  taxRate: ServiceTaxRate;
  satProdServCode?: string;
  satUnitCode?: string;
  isListableInWebsite: boolean;
  isPriceVisibleInWebsite: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
