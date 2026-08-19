import type { SelectItemGroup } from 'primeng/api';
import { ServiceUom } from '../../../data/dtos/service';
import { SERVICE_UOM_LABELS } from './service-uom-labels.const';

/** Heading order in the dropdown — commonest dimension first. */
const GROUP_ORDER = [
  'Trabajo',
  'Tiempo',
  'Cantidad',
  'Longitud',
  'Superficie',
  'Volumen',
  'Peso',
  // Last: thermal units are the specialist end of the list, and burying the
  // everyday ones under them would cost every user a scroll.
  'Energía',
] as const;

/** Each unit's heading. Typed `Record<ServiceUom, …>` on purpose: a new enum
 *  member fails to compile until it's grouped, rather than silently vanishing
 *  from the select. Membership only — the visible text stays in
 *  SERVICE_UOM_LABELS, so a label is edited in exactly one place.
 *
 *  Key order sets the order *within* a heading (object key order is insertion
 *  order for string keys), so keep these grouped as written. */
const GROUP_OF: Record<ServiceUom, (typeof GROUP_ORDER)[number]> = {
  [ServiceUom.Servicio]: 'Trabajo',
  [ServiceUom.Visita]: 'Trabajo',
  [ServiceUom.Viaje]: 'Trabajo',

  // Ascending within the heading, so the list reads like a ladder.
  [ServiceUom.Hora]: 'Tiempo',
  [ServiceUom.Dia]: 'Tiempo',
  [ServiceUom.Semana]: 'Tiempo',
  [ServiceUom.Mes]: 'Tiempo',
  [ServiceUom.Anio]: 'Tiempo',

  [ServiceUom.Unidad]: 'Cantidad',
  [ServiceUom.Pieza]: 'Cantidad',
  [ServiceUom.Caja]: 'Cantidad',
  [ServiceUom.Pallet]: 'Cantidad',
  [ServiceUom.Resma]: 'Cantidad',

  [ServiceUom.Metro]: 'Longitud',
  [ServiceUom.Kilometro]: 'Longitud',
  [ServiceUom.Yarda]: 'Longitud',
  [ServiceUom.Pulgada]: 'Longitud',

  [ServiceUom.MetroCuadrado]: 'Superficie',
  [ServiceUom.Hectarea]: 'Superficie',

  [ServiceUom.MetroCubico]: 'Volumen',
  [ServiceUom.Litro]: 'Volumen',
  [ServiceUom.Mililitro]: 'Volumen',
  [ServiceUom.Galon]: 'Volumen',
  [ServiceUom.OnzaLiquida]: 'Volumen',

  [ServiceUom.Kilogramo]: 'Peso',
  [ServiceUom.Onza]: 'Peso',

  [ServiceUom.Btu]: 'Energía',
  [ServiceUom.MillonBtu]: 'Energía',
  [ServiceUom.BtuPorPieCubico]: 'Energía',
  [ServiceUom.ToneladaRefrigeracion]: 'Energía',
};

/** PrimeNG `SelectItemGroup[]` for the form's unit select (`[group]="true"`).
 *  19 units is too many for a flat list, so they arrive pre-grouped. */
export const SERVICE_UOM_GROUPS: SelectItemGroup[] = GROUP_ORDER.map((label) => ({
  label,
  items: (Object.keys(GROUP_OF) as ServiceUom[])
    .filter((uom) => GROUP_OF[uom] === label)
    .map((value) => ({ label: SERVICE_UOM_LABELS[value], value })),
}));
