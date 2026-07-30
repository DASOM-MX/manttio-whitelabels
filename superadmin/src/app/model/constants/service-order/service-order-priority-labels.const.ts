import type { ServiceOrderPriority } from '../../enums/service-order/service-order-priority.enum';

export const SERVICE_ORDER_PRIORITY_LABELS: Record<ServiceOrderPriority, string> = {
  normal: 'Normal',
  urgent: 'Urgente',
};
