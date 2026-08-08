import type { ServiceEventType } from '../../model/enums/services/service-event-type.enum';

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

/** Unit a service is priced by. Full parity with the backend `ServiceUom` enum
 *  — the API rejects anything outside this list, so the form offers a select
 *  rather than a text field. Generic commercial units on purpose: the catalog
 *  is whitelabel and every tenant sells something different. */
export enum ServiceUom {
  // Trabajo
  Servicio = 'servicio',
  Visita = 'visita',
  Viaje = 'viaje',
  // Tiempo
  Hora = 'hora',
  Dia = 'dia',
  Semana = 'semana',
  Mes = 'mes',
  /** `anio`, not `ano` — ASCII wire values, without spelling a very different
   *  Spanish word into every payload and CSV export. */
  Anio = 'anio',
  // Cantidad
  Unidad = 'unidad',
  Pieza = 'pieza',
  Caja = 'caja',
  Pallet = 'pallet',
  Resma = 'resma',
  // Longitud
  Metro = 'metro',
  Kilometro = 'kilometro',
  Yarda = 'yarda',
  Pulgada = 'pulgada',
  // Superficie
  MetroCuadrado = 'metro_cuadrado',
  Hectarea = 'hectarea',
  // Volumen
  MetroCubico = 'metro_cubico',
  Litro = 'litro',
  Mililitro = 'mililitro',
  Galon = 'galon',
  OnzaLiquida = 'onza_liquida',
  // Peso
  Kilogramo = 'kilogramo',
  Onza = 'onza',
  /** Energía — thermal units, for HVAC work billed by heat load rather than
   *  by time or headcount (added 2026-07-31). */
  Btu = 'btu',
  MillonBtu = 'millon_btu',
  BtuPorPieCubico = 'btu_pie_cubico',
  ToneladaRefrigeracion = 'tonelada_refrigeracion',
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
  uom: ServiceUom;
  /** Internal management copy. Never reaches the website. */
  description?: string;
  /** Public card copy for the website listing — the only description the site
   *  ever sees. No fallback: a listed service without one renders title-only. */
  websiteDescription?: string;
  /** R2 key of the public card photo (`manttio-images`, via
   *  `POST /upload/website-image`). The **key** is what's stored and what a save
   *  sends back — the URL below is derived. */
  websiteImageKey?: string;
  /** Display URL for `websiteImageKey`, materialized by the backend. Read-only:
   *  never send it back. Absent when there's no photo *or* the deploy has no
   *  images CDN configured. */
  websiteImageUrl?: string;
  /** Tenant catalog code, unique across the live catalog when set. Internal
   *  only — never exposed on `/public/services`. */
  internalServiceCode?: string;
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
  uom: ServiceUom;
  description?: string;
  /** Empty string **clears** these on the server; `undefined` would leave the
   *  stored value untouched (the write is a PATCH), so the dialog always sends
   *  them. */
  websiteDescription?: string;
  websiteImageKey?: string;
  internalServiceCode?: string;
  taxRate: ServiceTaxRate;
  /** SAT CFDI catalog keys (18 §6.4). Sent as `''` when the owner erases one —
   *  the backend maps that to null, same as the website copy. No format
   *  validation on either side; 09 owns that. */
  satProdServCode?: string;
  satUnitCode?: string;
  isListableInWebsite: boolean;
  isPriceVisibleInWebsite: boolean;
  /** Clone provenance (18 §6.2): the id the form was prefilled from
   *  (`/services/new?from=<id>`). Sent only on that create — its presence is
   *  what makes the backend's `service_created` event say `via: 'clone'`. */
  sourceServiceId?: string;
}

export interface DeleteServiceRequest {
  deleteComment: string;
}

/** A resolved trail entry of `GET /services/:id/timeline` (18 §6.1) — the
 *  catalog's append-only audit. Admin tier only: the API 403s office and
 *  technician, so the detail page never even asks for it below that tier.
 *  `actorName` comes resolved from the server; `changes` is per-type
 *  (`via` on a create, per-field `{ old, new }` on an update). */
export interface ServiceEvent {
  id: string;
  type: ServiceEventType;
  actorId: string;
  actorName?: string;
  changes?: Record<string, unknown>;
  note?: string;
  createdAt: string;
}
