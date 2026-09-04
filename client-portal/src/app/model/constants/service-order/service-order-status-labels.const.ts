import { ServiceOrderStatus } from '../../enums/service-order/service-order-status.enum';

export const SERVICE_ORDER_STATUS_LABELS: Record<ServiceOrderStatus, string> = {
  [ServiceOrderStatus.Open]: 'Abierta',
  [ServiceOrderStatus.Completed]: 'Completada',
  [ServiceOrderStatus.Cancelled]: 'Cancelada',
};
