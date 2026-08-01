import { ServiceUom } from '../../../data/dtos/service';

/** Suggested `c_ClaveUnidad` per catalog unit (18 §6.4) — a **starting point
 *  the owner can overwrite**, never a validation rule: the form only prefills
 *  an empty field, and 09 owns real SAT validation when it lands.
 *
 *  Deliberately partial. Only units with an unambiguous UN/ECE code (the
 *  standard `c_ClaveUnidad` draws from) are mapped; `visita`, `viaje` and
 *  `pallet` have no obvious equivalent, so their field stays empty for the
 *  owner to fill rather than seeding a key that could reach a CFDI wrong.
 *  Verify against the current SAT catalog before relying on any of these. */
export const SERVICE_UOM_SAT_UNIT_CODES: Partial<Record<ServiceUom, string>> = {
  // Trabajo
  [ServiceUom.Servicio]: 'E48', // Unidad de servicio
  // Tiempo
  [ServiceUom.Hora]: 'HUR',
  [ServiceUom.Dia]: 'DAY',
  [ServiceUom.Mes]: 'MON',
  // Cantidad
  [ServiceUom.Unidad]: 'C62', // Uno
  [ServiceUom.Pieza]: 'H87',
  // Longitud
  [ServiceUom.Metro]: 'MTR',
  [ServiceUom.Yarda]: 'YRD',
  [ServiceUom.Pulgada]: 'INH',
  // Superficie
  [ServiceUom.MetroCuadrado]: 'MTK',
  [ServiceUom.Hectarea]: 'HAR',
  // Volumen
  [ServiceUom.MetroCubico]: 'MTQ',
  [ServiceUom.Litro]: 'LTR',
  [ServiceUom.Mililitro]: 'MLT',
  [ServiceUom.Galon]: 'GLL', // Galón estadounidense
  // Peso
  [ServiceUom.Kilogramo]: 'KGM',
};
