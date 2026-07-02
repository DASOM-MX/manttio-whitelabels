import type { customers } from '../models/customers.model';

export type CustomerRow = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type UpdateCustomerFields = Partial<
  Pick<
    CustomerRow,
    | 'name'
    | 'identification'
    | 'phone'
    | 'email'
    | 'observation'
    | 'address'
    | 'state'
    | 'razonSocial'
    | 'timezone'
  >
>;
