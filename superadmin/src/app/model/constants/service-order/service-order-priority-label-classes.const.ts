import { ServiceOrderPriority } from '../../enums/service-order/service-order-priority.enum';

/** Label tint per priority — the dark shade of the flag's family (the
 *  2026-07-31 "dark colored labels" ask), readable on both themes where the
 *  flag's own lighter fill would not be. */
export const SERVICE_ORDER_PRIORITY_LABEL_CLASSES: Record<ServiceOrderPriority, string> = {
  [ServiceOrderPriority.Low]: 'text-sky-700 dark:text-sky-300',
  [ServiceOrderPriority.Normal]: 'text-blue-800 dark:text-blue-300',
  [ServiceOrderPriority.Medium]: 'text-yellow-600 dark:text-yellow-300',
  [ServiceOrderPriority.High]: 'text-orange-700 dark:text-orange-300',
  [ServiceOrderPriority.Urgent]: 'text-red-700 dark:text-red-400',
};
