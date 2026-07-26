/** Service catalog DTOs (18-services.md §1) — what the business sells, priced
 *  per unit of measure. Flat catalog: no categories or variants in v1. */

/** Mexican IVA rate. Full parity with the backend `ServiceTaxRate` enum.
 *  `Exento` is CFDI-distinct from `Iva0` (tasa cero) even though both compute
 *  to 0 MXN — they are not interchangeable. */
export enum ServiceTaxRate {
  /** General rate — the field default. */
  Iva16 = 'iva_16',
  /** Región fronteriza (border stimulus), applied per qualifying service. */
  Iva8 = 'iva_8',
  /** Tasa cero: taxed at 0%, still an IVA-bearing act. */
  Iva0 = 'iva_0',
  /** Outside the IVA act entirely. */
  Exento = 'exento',
}

export interface Service {
  id: string;
  name: string;
  /** Money is a **string**, never a number: the column is `numeric(12,2)` and a
   *  JSON float would round pesos. Only display crosses to Number. */
  price: string;
  /** Internal cost — back-office only (owner/admin/office, 18 §2). The API
   *  omits the field entirely for technicians, so `undefined` here means
   *  "not visible to me", not "not set". */
  cost?: string;
  /** Free text v1: 'servicio', 'hora', 'equipo', 'visita'… */
  uom: string;
  description?: string;
  taxRate: ServiceTaxRate;
  /** SAT CFDI catalog keys — carried for facturación (09), no v1 UI. */
  satProdServCode?: string;
  satUnitCode?: string;
  isListableInWebsite: boolean;
  /** Only meaningful while `isListableInWebsite` is true — the backend forces
   *  it false whenever listing is off. */
  isPriceVisibleInWebsite: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** The catalog is small enough to ship whole — search only, no pagination. */
export interface ServiceListQuery {
  q?: string;
}

/** Money goes **out** as a number (the validator coerces and fixes to 2dp) and
 *  comes back as a fixed-2 string. */
export interface SaveServiceRequest {
  name: string;
  price: number;
  cost?: number;
  uom: string;
  description?: string;
  taxRate: ServiceTaxRate;
  isListableInWebsite: boolean;
  isPriceVisibleInWebsite: boolean;
}

export interface DeleteServiceRequest {
  deleteComment: string;
}
