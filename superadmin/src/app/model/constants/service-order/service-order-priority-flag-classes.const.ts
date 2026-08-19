import { ServiceOrderPriority } from '../../enums/service-order/service-order-priority.enum';

/** Filled-flag color per priority (owner spec 2026-07-31): the baby-blue → red
 *  ladder. Glyph only — the label carries its own darker shade of the same
 *  family (the label-classes const beside this one) so the text stays
 *  readable while the flag does the signaling. */
export const SERVICE_ORDER_PRIORITY_FLAG_CLASSES: Record<ServiceOrderPriority, string> = {
  [ServiceOrderPriority.Low]: 'text-sky-400 dark:text-sky-300',
  [ServiceOrderPriority.Normal]: 'text-blue-600 dark:text-blue-400',
  [ServiceOrderPriority.Medium]: 'text-yellow-400 dark:text-yellow-300',
  [ServiceOrderPriority.High]: 'text-orange-500 dark:text-orange-400',
  [ServiceOrderPriority.Urgent]: 'text-red-600 dark:text-red-400',
};
