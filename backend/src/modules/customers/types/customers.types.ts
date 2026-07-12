import type { customers } from '../models/customers.model';
import type { customerContacts } from '../models/customer-contacts.model';
import type { customerFiscal } from '../models/customer-fiscal.model';

export type CustomerRow = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type UpdateCustomerFields = Partial<
  Pick<
    CustomerRow,
    | 'name'
    | 'contactName'
    | 'identification'
    | 'phone'
    | 'email'
    | 'observation'
    | 'address'
    | 'state'
    | 'razonSocial'
    | 'timezone'
    | 'status'
    | 'source'
    | 'blacklistReason'
    | 'nextFollowUpAt'
    | 'tags'
  >
>;

export type CustomerContactRow = typeof customerContacts.$inferSelect;
export type NewCustomerContact = typeof customerContacts.$inferInsert;

export type CustomerFiscalRow = typeof customerFiscal.$inferSelect;
export type NewCustomerFiscal = typeof customerFiscal.$inferInsert;

// Filters accepted by the list repository (paged when `limit` is present;
// unbounded full list otherwise, for the main frontend).
export interface ListCustomersFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: CustomerRow['status'];
  source?: CustomerRow['source'];
  tags?: string[];
}
