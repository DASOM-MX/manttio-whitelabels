import type { customers } from '../models/customers.model';
import type { customerContacts } from '../models/customer-contacts.model';
import type { customerFiscal } from '../models/customer-fiscal.model';

export type CustomerRow = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
// Attribution columns (utm_*, gclid, fbclid, referrer, landing_page) are
// deliberately absent: write-once, set only by the public lead insert.
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
    | 'blacklistReason'
    | 'nextFollowUpAt'
    | 'clientType'
    | 'statusChangedAt'
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

/** Row for the Panel's recent-clients card (utm-params 03 amendment): display
 *  fields only, newest first. `name` is the commercial/display name; for
 *  business rows `contactName` carries the person who registered. */
export type RecentCustomerRow = Pick<
  CustomerRow,
  'id' | 'name' | 'contactName' | 'clientType' | 'source' | 'createdAt'
>;

/** What `GET /customers/all` returns per row (21 §3) — the whole-roster read
 *  behind every customer picker.
 *
 *  Deliberately a projection, not `CustomerRow`: this is the one customer read
 *  with no page and no limit, so its payload grows linearly with the tenant.
 *  It carries exactly what today's consumers render — the field app's directory
 *  table (`identification`, `phone`, `state`) and its search haystack
 *  (`razonSocial`, `email`), the report-add picker (`name`, `identification`),
 *  the reports list's per-row date formatting (`timezone`), and the superadmin
 *  pickers (`name`). Widen this rather than sending a picker back to full rows.
 *  CRM/attribution columns are absent — no roster consumer reads them. */
export type CustomerOption = Pick<
  CustomerRow,
  | 'id'
  | 'name'
  | 'contactName'
  | 'razonSocial'
  | 'identification'
  | 'phone'
  | 'email'
  | 'state'
  | 'status'
  | 'timezone'
>;
