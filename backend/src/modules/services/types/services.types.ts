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
    | 'websiteDescription'
    | 'websiteImageKey'
    | 'internalServiceCode'
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
  /** Selected from `services.websiteDescription`. The internal `description`
   *  is management copy and is never read by this query (decided 2026-07-25). */
  websiteDescription: string | null;
  /** R2 key in `manttio-images`. Materialized to a URL by the service layer —
   *  the raw key never reaches the response. */
  websiteImageKey: string | null;
  uom: ServiceUom;
  price: string;
  isPriceVisibleInWebsite: boolean;
}

/** What `GET /public/services` returns per entry (18 §4). `price` is present
 *  only when the service opts in — an omitted `price` is the site's cue to
 *  render "Precio a consultar" rather than a number. No tax rate: the website
 *  is a brochure, and quoting IVA there would imply a binding price. No
 *  `internalServiceCode` either — it never leaves the tenant. */
export interface PublicServiceDTO {
  id: string;
  name: string;
  /** The tenant's **website** copy (`websiteDescription`), never the internal
   *  `description`. A listed service without one renders a title-only card —
   *  there is deliberately no fallback to the management note. */
  description?: string;
  /** Full CDN URL of the card photo, materialized from `websiteImageKey`.
   *  Absent when the service has no photo **or** when the deploy has no
   *  `IMAGES_CDN_BASE_URL` — either way the site renders the text-only card,
   *  never a broken image. */
  imageUrl?: string;
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
  /** Internal management copy — never shown on the website. */
  description?: string;
  /** Public card copy for the website listing. */
  websiteDescription?: string;
  /** Stored R2 key of the public card photo — what the editor sends back on
   *  save, so a round-trip never loses the image. */
  websiteImageKey?: string;
  /** Read-only companion of `websiteImageKey`, materialized against
   *  `IMAGES_CDN_BASE_URL` (never stored). Absent when there is no photo or no
   *  configured CDN base. */
  websiteImageUrl?: string;
  /** Tenant catalog code, unique when set. Internal only. */
  internalServiceCode?: string;
  taxRate: ServiceTaxRate;
  satProdServCode?: string;
  satUnitCode?: string;
  isListableInWebsite: boolean;
  isPriceVisibleInWebsite: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
