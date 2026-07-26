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

  [ServiceUom.Hora]: 'Tiempo',
  [ServiceUom.Dia]: 'Tiempo',
  [ServiceUom.Mes]: 'Tiempo',

  [ServiceUom.Unidad]: 'Cantidad',
  [ServiceUom.Pieza]: 'Cantidad',
  [ServiceUom.Pallet]: 'Cantidad',

  [ServiceUom.Metro]: 'Longitud',
  [ServiceUom.Yarda]: 'Longitud',
  [ServiceUom.Pulgada]: 'Longitud',

  [ServiceUom.MetroCuadrado]: 'Superficie',
  [ServiceUom.Hectarea]: 'Superficie',

  [ServiceUom.MetroCubico]: 'Volumen',
  [ServiceUom.Litro]: 'Volumen',
  [ServiceUom.Mililitro]: 'Volumen',
  [ServiceUom.Galon]: 'Volumen',

  [ServiceUom.Kilogramo]: 'Peso',
};

/** PrimeNG `SelectItemGroup[]` for the form's unit select (`[group]="true"`).
 *  19 units is too many for a flat list, so they arrive pre-grouped. */
export const SERVICE_UOM_GROUPS: SelectItemGroup[] = GROUP_ORDER.map((label) => ({
  label,
  items: (Object.keys(GROUP_OF) as ServiceUom[])
    .filter((uom) => GROUP_OF[uom] === label)
    .map((value) => ({ label: SERVICE_UOM_LABELS[value], value })),
}));
