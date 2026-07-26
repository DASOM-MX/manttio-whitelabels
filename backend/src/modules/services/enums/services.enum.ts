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

// Unit of measure a service is priced by (18 §1, decided 2026-07-26 — supersedes
// the free-text v1 posture). A closed list rather than free text so the same
// unit can't arrive as 'hr' / 'Hora' / 'horas' and split reporting later; kept
// deliberately generic (common commercial units, no trade jargon) because the
// catalog is whitelabel and every tenant sells something different.
//
// Validator-enforced only — no DB check constraint, same posture as taxRate:
// the Drizzle model stays the single source of truth.
export enum ServiceUom {
  Servicio = 'servicio',
  Visita = 'visita',
  Hora = 'hora',
  Dia = 'dia',
  Mes = 'mes',
  Unidad = 'unidad',
  Pieza = 'pieza',
  Metro = 'metro',
  MetroCuadrado = 'metro_cuadrado',
  MetroCubico = 'metro_cubico',
  Kilogramo = 'kilogramo',
  Litro = 'litro',
}
