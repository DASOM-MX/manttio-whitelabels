import { ServiceUom } from '../../../data/dtos/service';

/** Suggested `c_ClaveUnidad` per catalog unit (18 §6.4) — a **starting point
 *  the owner can overwrite**, never a validation rule: the form only prefills
 *  an empty field, and 09 owns real SAT validation when it lands.
 *
 *  Exhaustive by type: `Record`, not `Partial<Record>`, so adding a unit to
 *  `ServiceUom` without deciding its SAT key is a build error rather than a
 *  field that silently stops suggesting.
 *
 *  Codes verified against the CFDI 4.0 `c_ClaveUnidad` catalog on 2026-07-31.
 *  The SAT reissues this catalog, so re-check before trusting it in anger —
 *  and note the catalog is **coarser than our unit list**: it has no entry for
 *  a visit, a trip or a refrigeration ton, so those four ride
 *  `E48 Unidad de servicio` like `servicio` itself. That collapse is
 *  deliberate, not an oversight. */
export const SERVICE_UOM_SAT_UNIT_CODES: Record<ServiceUom, string> = {
  // Trabajo — the catalog has no visita/viaje unit; E48 is the standard
  // service line-item key (ACT "Actividades generales" is the alternative).
  [ServiceUom.Servicio]: 'E48', // Unidad de servicio
  [ServiceUom.Visita]: 'E48',
  [ServiceUom.Viaje]: 'E48',
  // Tiempo
  [ServiceUom.Hora]: 'HUR',
  [ServiceUom.Dia]: 'DAY',
  [ServiceUom.Semana]: 'WEE', // Semana
  [ServiceUom.Mes]: 'MON',
  [ServiceUom.Anio]: 'ANN', // Año (365.25 días)
  // Cantidad
  [ServiceUom.Unidad]: 'C62', // Uno
  [ServiceUom.Pieza]: 'H87', // Pieza
  [ServiceUom.Caja]: 'XBX', // Caja
  [ServiceUom.Pallet]: 'XPX', // Pallet (X8A is the wood-specific variant)
  [ServiceUom.Resma]: 'RM', // Resma
  // Longitud
  [ServiceUom.Metro]: 'MTR',
  [ServiceUom.Kilometro]: 'KMT', // Kilómetro
  [ServiceUom.Yarda]: 'YRD',
  [ServiceUom.Pulgada]: 'INH', // Pulgada
  // Superficie
  [ServiceUom.MetroCuadrado]: 'MTK',
  [ServiceUom.Hectarea]: 'HAR', // Hectárea (hectómetro cuadrado)
  // Volumen
  [ServiceUom.MetroCubico]: 'MTQ',
  [ServiceUom.Litro]: 'LTR',
  [ServiceUom.Mililitro]: 'MLT',
  [ServiceUom.Galon]: 'GLL', // Galón (EUA)
  [ServiceUom.OnzaLiquida]: 'OZA', // Onza líquida (EUA)
  // Peso
  [ServiceUom.Kilogramo]: 'KGM',
  [ServiceUom.Onza]: 'ONZ', // Onza (avoirdupois)
  // Energía. The catalog splits its thermal units between the *tabla
  // internacional* and *termoquímica* scales; we take the international ones
  // (BTU / N58) — the termoquímica pair (J47 / N59) differs by ~0.03%, which
  // no price list cares about, but swap them if an accountant asks.
  [ServiceUom.Btu]: 'BTU', // Unidad térmica británica (tabla internacional)
  [ServiceUom.MillonBtu]: 'BZ', // Millones de BTUs
  [ServiceUom.BtuPorPieCubico]: 'B0', // Btu por pie cúbico
  // No `tonelada de refrigeración` exists in c_ClaveUnidad — a catalog search
  // for "refrigeraci" returns nothing — so a TR line invoices as a service
  // unit like any other. The UI still says TR, which is what the client reads.
  [ServiceUom.ToneladaRefrigeracion]: 'E48',
};
