import type { CustomerStatus } from '../../../data/dtos/customer';

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  active: 'Activo',
  lead: 'Lead',
  disabled: 'Inactivo',
  blacklisted: 'Lista negra',
};
