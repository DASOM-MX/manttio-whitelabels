import type { EquipmentOrigin } from '../../../data/dtos/equipment';

/** Pill severities for the equipment origin (11): sales/rentals read as
 *  business outcomes, external units stay neutral. */
export const EQUIPMENT_ORIGIN_SEVERITIES: Record<EquipmentOrigin, 'success' | 'info' | 'secondary'> = {
  externo: 'secondary',
  venta: 'success',
  renta: 'info',
};
