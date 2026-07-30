// Mexican IVA rate carried by each catalog service (18 §1, decided 2026-07-24).
// A `taxable` boolean isn't enough — the rates differ per service, and `Exento`
// is CFDI-distinct from `Iva0` (tasa cero) even though both compute to 0 MXN.
// Quotation (20) and order (19) lines snapshot this value, so IVA sums per line
// and a later catalog edit never rewrites history.
export enum ServiceTaxRate {
  // General rate — the field default.
  Iva16 = 'iva_16',
  // Región fronteriza (border stimulus). In scope: the tenant works mainly in
  // northern Mexico, and it applies per qualifying service, not per tenant.
  Iva8 = 'iva_8',
  // Tasa cero: taxed at 0%, still an IVA-bearing act.
  Iva0 = 'iva_0',
  // Exento: outside the IVA act entirely. Same 0 MXN, different CFDI treatment.
  Exento = 'exento',
}

// Append-only timeline entry types (18 §6.1). Mirrors `quotation_events` /
// `customer_interactions`: no updates, no deletes — the timeline IS the
// catalog's price-change record.
export enum ServiceEventType {
  // `changes.via` says how the row came to exist; a clone also carries
  // `changes.sourceServiceId`.
  Created = 'service_created',
  // `changes` = per-field `{ old, new }` for every edited column — recording
  // all of them costs nothing and spares a curated list going stale.
  Updated = 'service_updated',
  // Audited soft delete; `note` carries the mandatory delete comment. Written
  // even though the timeline becomes unreachable through the API once the
  // service is tombstoned — the row is the record, and a deletion with no
  // trail is exactly the gap an audit trail exists to close.
  Deleted = 'service_deleted',
}

// How a `service_created` row came to exist. Declared whole now — `Clone`
// (CP-5) and `Import` (CP-6) are the contract those checkpoints fill, same
// posture as `QuotationEventRefKind.ServiceOrder`.
export enum ServiceCreatedVia {
  Form = 'form',
  Clone = 'clone',
  Import = 'import',
}

// Unit of measure a service is priced by (18 §1, decided 2026-07-26 — supersedes
// the free-text v1 posture). A closed list rather than free text so the same
// unit can't arrive as 'hr' / 'Hora' / 'horas' and split reporting later; kept
// deliberately generic (common commercial units, no trade jargon) because the
// catalog is whitelabel and every tenant sells something different.
//
// Validator-enforced only — no DB check constraint, same posture as taxRate:
// the Drizzle model stays the single source of truth.
export enum ServiceUom {
  // Trabajo
  Servicio = 'servicio',
  Visita = 'visita',
  Viaje = 'viaje',
  // Tiempo
  Hora = 'hora',
  Dia = 'dia',
  Mes = 'mes',
  // Cantidad
  Unidad = 'unidad',
  Pieza = 'pieza',
  Pallet = 'pallet',
  // Longitud
  Metro = 'metro',
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
  // Peso
  Kilogramo = 'kilogramo',
}
