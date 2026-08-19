import { ServiceUom } from '../../../data/dtos/service';

/** Table-column variant — 'm²' rather than 'Metro cuadrado (m²)'. The named
 *  units are already short, so only the measures differ from the full labels. */
export const SERVICE_UOM_SHORT_LABELS: Record<ServiceUom, string> = {
  [ServiceUom.Servicio]: 'Servicio',
  [ServiceUom.Visita]: 'Visita',
  [ServiceUom.Viaje]: 'Viaje',

  [ServiceUom.Hora]: 'Hora',
  [ServiceUom.Dia]: 'Día',
  [ServiceUom.Semana]: 'Semana',
  [ServiceUom.Mes]: 'Mes',
  [ServiceUom.Anio]: 'Año',

  [ServiceUom.Unidad]: 'Unidad',
  [ServiceUom.Pieza]: 'Pieza',
  [ServiceUom.Caja]: 'Caja',
  [ServiceUom.Pallet]: 'Pallet',
  [ServiceUom.Resma]: 'Resma',

  [ServiceUom.Metro]: 'm',
  [ServiceUom.Kilometro]: 'km',
  [ServiceUom.Yarda]: 'yd',
  [ServiceUom.Pulgada]: 'in',

  [ServiceUom.MetroCuadrado]: 'm²',
  [ServiceUom.Hectarea]: 'ha',

  [ServiceUom.MetroCubico]: 'm³',
  [ServiceUom.Litro]: 'L',
  [ServiceUom.Mililitro]: 'mL',
  [ServiceUom.Galon]: 'gal',
  [ServiceUom.OnzaLiquida]: 'fl oz',

  [ServiceUom.Kilogramo]: 'kg',
  [ServiceUom.Onza]: 'oz',

  [ServiceUom.Btu]: 'BTU',
  [ServiceUom.MillonBtu]: 'MMBTU',
  [ServiceUom.BtuPorPieCubico]: 'BTU/ft³',
  [ServiceUom.ToneladaRefrigeracion]: 'TR',
};
