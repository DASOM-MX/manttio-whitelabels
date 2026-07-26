import { ServiceUom } from '../../../data/dtos/service';

/** Full unit labels for the form select (18 §1). Measures carry their symbol in
 *  parentheses so "Metro cuadrado (m²)" is unambiguous in a dropdown; the table
 *  uses the symbol alone — see SERVICE_UOM_SHORT_LABELS.
 *
 *  Declaration order is the order the select renders: grouped by dimension
 *  (trabajo → tiempo → cantidad → longitud → superficie → volumen → peso),
 *  commonest first within each group. Enum values stay ASCII (`hectarea`,
 *  `galon`) even where the label is accented — the code is a wire value. */
export const SERVICE_UOM_LABELS: Record<ServiceUom, string> = {
  [ServiceUom.Servicio]: 'Servicio',
  [ServiceUom.Visita]: 'Visita',
  [ServiceUom.Viaje]: 'Viaje',

  [ServiceUom.Hora]: 'Hora',
  [ServiceUom.Dia]: 'Día',
  [ServiceUom.Mes]: 'Mes',

  [ServiceUom.Unidad]: 'Unidad',
  [ServiceUom.Pieza]: 'Pieza',
  [ServiceUom.Pallet]: 'Pallet',

  [ServiceUom.Metro]: 'Metro (m)',
  [ServiceUom.Yarda]: 'Yarda (yd)',
  [ServiceUom.Pulgada]: 'Pulgada (in)',

  [ServiceUom.MetroCuadrado]: 'Metro cuadrado (m²)',
  [ServiceUom.Hectarea]: 'Hectárea (ha)',

  [ServiceUom.MetroCubico]: 'Metro cúbico (m³)',
  [ServiceUom.Litro]: 'Litro (L)',
  [ServiceUom.Mililitro]: 'Mililitro (mL)',
  [ServiceUom.Galon]: 'Galón (gal)',

  [ServiceUom.Kilogramo]: 'Kilogramo (kg)',
};
