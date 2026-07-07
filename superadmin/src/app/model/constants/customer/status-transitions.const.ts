import { CustomerStatus } from '../../../data/dtos/customer';

/** Legal status transitions (08 §1) — the dialog only offers these. */
export const STATUS_TRANSITIONS: Record<CustomerStatus, CustomerStatus[]> = {
  [CustomerStatus.Lead]: [CustomerStatus.Active, CustomerStatus.Blacklisted],
  [CustomerStatus.Active]: [CustomerStatus.Disabled, CustomerStatus.Blacklisted],
  [CustomerStatus.Disabled]: [CustomerStatus.Active],
  [CustomerStatus.Blacklisted]: [CustomerStatus.Active, CustomerStatus.Disabled],
};
