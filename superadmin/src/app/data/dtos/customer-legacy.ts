import type { Customer } from './customer';

/** Interop shapes for today's backend: the single-customer routes still answer
 *  `{ customer: row }` as well as a bare row, and rows arrive without the
 *  CRM/fiscal columns that `normalize()` fills in.
 *
 *  The **list** half of this file is gone as of 21 CP-4 — `GET /customers` now
 *  answers the paged `GenericQueryResponse` contract, so there is one list
 *  shape and nothing left to reconcile. */
export type LegacyCustomerRow = Omit<Customer, 'contacts' | 'tags' | 'status' | 'source'> &
  Partial<Pick<Customer, 'contacts' | 'tags' | 'status' | 'source'>>;

export type CustomerResponse = LegacyCustomerRow | { customer: LegacyCustomerRow };
