import { ServiceUom } from '../../../data/dtos/service';

/** Table-column variant — 'm²' rather than 'Metro cuadrado (m²)'. The named
 *  units are already short, so only the measures differ from the full labels. */
export const SERVICE_UOM_SHORT_LABELS: Record<ServiceUom, string> = {
  [ServiceUom.Servicio]: 'Servicio',
  [ServiceUom.Visita]: 'Visita',
  [ServiceUom.Viaje]: 'Viaje',

  [ServiceUom.Hora]: 'Hora',
  [ServiceUom.Dia]: 'Día',
  [ServiceUom.Mes]: 'Mes',

  [ServiceUom.Unidad]: 'Unidad',
  [ServiceUom.Pieza]: 'Pieza',
  [ServiceUom.Pallet]: 'Pallet',

  [ServiceUom.Metro]: 'm',
  [ServiceUom.Yarda]: 'yd',
  [ServiceUom.Pulgada]: 'in',

  [ServiceUom.MetroCuadrado]: 'm²',
  [ServiceUom.Hectarea]: 'ha',

  [ServiceUom.MetroCubico]: 'm³',
  [ServiceUom.Litro]: 'L',
  [ServiceUom.Mililitro]: 'mL',
  [ServiceUom.Galon]: 'gal',

  [ServiceUom.Kilogramo]: 'kg',
};
