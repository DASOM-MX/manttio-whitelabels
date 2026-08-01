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
 *  a visit or a trip, so those ride `E48 Unidad de servicio` like `servicio`
 *  itself. That collapse is deliberate, not an oversight. */
export const SERVICE_UOM_SAT_UNIT_CODES: Record<ServiceUom, string> = {
  // Trabajo — the catalog has no visita/viaje unit; E48 is the standard
  // service line-item key (ACT "Actividades generales" is the alternative).
  [ServiceUom.Servicio]: 'E48', // Unidad de servicio
  [ServiceUom.Visita]: 'E48',
  [ServiceUom.Viaje]: 'E48',
  // Tiempo
  [ServiceUom.Hora]: 'HUR',
  [ServiceUom.Dia]: 'DAY',
  [ServiceUom.Mes]: 'MON',
  // Cantidad
  [ServiceUom.Unidad]: 'C62', // Uno
  [ServiceUom.Pieza]: 'H87', // Pieza
  [ServiceUom.Pallet]: 'XPX', // Pallet (X8A is the wood-specific variant)
  // Longitud
  [ServiceUom.Metro]: 'MTR',
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
  // Peso
  [ServiceUom.Kilogramo]: 'KGM',
};
