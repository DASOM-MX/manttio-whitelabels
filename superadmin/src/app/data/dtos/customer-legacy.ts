import type { Customer } from './customer';
import type { PagedResponse } from './paged-response';

/** Interop shapes for today's backend (07-clients.md — backend customers
 *  migration pending): the live API still answers the field-app contract —
 *  `{ customers: [...] }` lists, `{ customer: row }` singles, rows without the
 *  CRM/fiscal columns. Delete this file once the paged `/customers` contract
 *  lands server-side. */
export type LegacyCustomerRow = Omit<Customer, 'contacts' | 'tags' | 'status' | 'source'> &
  Partial<Pick<Customer, 'contacts' | 'tags' | 'status' | 'source'>>;

export type CustomerResponse = LegacyCustomerRow | { customer: LegacyCustomerRow };

export type CustomerListResponse =
  | PagedResponse<LegacyCustomerRow>
  | { customers: LegacyCustomerRow[] };
