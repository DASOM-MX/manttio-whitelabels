import { CustomerStatus } from '../enums/customers.enum';

// Legal status transitions (08 §1). The superadmin dialog offers only these;
// the API enforces them (see utils/customer-status.ts).
export const STATUS_TRANSITIONS: Record<CustomerStatus, CustomerStatus[]> = {
  [CustomerStatus.Lead]: [CustomerStatus.Active, CustomerStatus.Blacklisted],
  [CustomerStatus.Active]: [CustomerStatus.Disabled, CustomerStatus.Blacklisted],
  [CustomerStatus.Disabled]: [CustomerStatus.Active],
  [CustomerStatus.Blacklisted]: [CustomerStatus.Active, CustomerStatus.Disabled],
};

// Spanish status labels — used to compose the `system` timeline entry body so
// it reads the same as the UI (superadmin CUSTOMER_STATUS_LABELS).
export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  [CustomerStatus.Active]: 'Activo',
  [CustomerStatus.Lead]: 'Lead',
  [CustomerStatus.Disabled]: 'Inactivo',
  [CustomerStatus.Blacklisted]: 'Lista negra',
};
