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
    | 'tags'
    | 'status'
    | 'source'
    | 'timezone'
  >
>;

export type ContactRow = typeof customerContacts.$inferSelect;
export type NewContact = typeof customerContacts.$inferInsert;
export type FiscalRow = typeof customerFiscal.$inferSelect;
export type NewFiscal = typeof customerFiscal.$inferInsert;

/** The customers API returns the customer with its contacts + fiscal nested. */
export interface CustomerWithRelations extends CustomerRow {
  contacts: ContactRow[];
  fiscal: FiscalRow | null;
}
