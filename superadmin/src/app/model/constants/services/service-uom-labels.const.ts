import { ServiceUom } from '../../../data/dtos/service';

/** Full unit labels for the form select (18 §1). Measures carry their symbol in
 *  parentheses so "Metro cuadrado (m²)" is unambiguous in a dropdown; the table
 *  uses the symbol alone — see SERVICE_UOM_SHORT_LABELS. Declaration order is
 *  the order the select renders, commonest first. */
export const SERVICE_UOM_LABELS: Record<ServiceUom, string> = {
  [ServiceUom.Servicio]: 'Servicio',
  [ServiceUom.Visita]: 'Visita',
  [ServiceUom.Hora]: 'Hora',
  [ServiceUom.Dia]: 'Día',
  [ServiceUom.Mes]: 'Mes',
  [ServiceUom.Unidad]: 'Unidad',
  [ServiceUom.Pieza]: 'Pieza',
  [ServiceUom.Metro]: 'Metro (m)',
  [ServiceUom.MetroCuadrado]: 'Metro cuadrado (m²)',
  [ServiceUom.MetroCubico]: 'Metro cúbico (m³)',
  [ServiceUom.Kilogramo]: 'Kilogramo (kg)',
  [ServiceUom.Litro]: 'Litro (L)',
};
