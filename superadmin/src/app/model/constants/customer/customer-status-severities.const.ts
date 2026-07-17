import type { CustomerStatus } from '../../../data/dtos/customer';

/** p-tag severities per client status — pills pair color with a label. */
export const CUSTOMER_STATUS_SEVERITIES: Record<
  CustomerStatus,
  'success' | 'info' | 'secondary' | 'danger'
> = {
  active: 'success',
  lead: 'info',
  disabled: 'secondary',
  blacklisted: 'danger',
};
