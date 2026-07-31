import type { ServiceOrderPriority } from '../../enums/service-order/service-order-priority.enum';

/** Insertion order is the ladder (low → urgent) — the priority selects build
 *  their option lists straight from these entries. */
export const SERVICE_ORDER_PRIORITY_LABELS: Record<ServiceOrderPriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};
