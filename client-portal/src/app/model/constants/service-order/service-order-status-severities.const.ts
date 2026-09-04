import { ServiceOrderStatus } from '../../enums/service-order/service-order-status.enum';

/** p-tag severities per status — pills always pair color with a label. */
export const SERVICE_ORDER_STATUS_SEVERITIES: Record<
  ServiceOrderStatus,
  'info' | 'success' | 'contrast'
> = {
  [ServiceOrderStatus.Open]: 'info',
  [ServiceOrderStatus.Completed]: 'success',
  [ServiceOrderStatus.Cancelled]: 'contrast',
};
