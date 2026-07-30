import type { ServiceOrderStatus } from '../../enums/service-order/service-order-status.enum';

export const SERVICE_ORDER_STATUS_LABELS: Record<ServiceOrderStatus, string> = {
  open: 'Abierta',
  completed: 'Completada',
  cancelled: 'Cancelada',
};
