import type { ServiceOrderStatus } from '../../enums/service-order/service-order-status.enum';

/** p-tag severities per order status — pills always pair color with a label. */
export const SERVICE_ORDER_STATUS_SEVERITIES: Record<
  ServiceOrderStatus,
  'info' | 'success' | 'danger'
> = {
  open: 'info',
  completed: 'success',
  cancelled: 'danger',
};
