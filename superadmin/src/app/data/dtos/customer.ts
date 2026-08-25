/** Customers DTOs (07-clients.md §1) — the product's existing `customers`
 *  resource (UI says "cliente", code keeps `customers`), extended with CRM
 *  fields (UI in 08) and CFDI 4.0 fiscal basics. Net-new columns are a
 *  recorded backend ask. */

export enum CustomerStatus {
  Active = 'active',
  Lead = 'lead',
  Disabled = 'disabled',
  Blacklisted = 'blacklisted',
}

// Full parity with the backend enum + the customers_source_check constraint
// (10 values, verified 2026-07-20). deriveSource maps any matching utm_source
// on the public lead endpoint; unmapped values fall back to Website.
export enum CustomerSource {
  Facebook = 'facebook',
  Google = 'google',
  Referral = 'referral',
  Website = 'website',
  Phonecall = 'phonecall',
  PersonalMeeting = 'personal_meeting',
  Other = 'other',
  // Share-link-only channels: never hand-picked (manual-customer-sources.const);
  // facebook/website above are share-link channels too but stay pickable.
  Instagram = 'instagram',
  Tiktok = 'tiktok',
  Whatsapp = 'whatsapp',
}

export interface CustomerContact {
  id?: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  /** The primary contact — exactly one per customer. The backend mirrors it to
   *  the customer's denormalized `contactName`/`phone`/`email`. */
  isDefault?: boolean;
}

export interface CustomerFiscal {
  rfc: string; // 12 (moral) / 13 (física), uppercase
  legalName: string; // razón social, no régimen suffix
  taxRegimeCode: string; // SAT c_RegimenFiscal
  fiscalZip: string; // 5 digits
  cfdiUseCode: string; // SAT c_UsoCFDI
  billingEmail?: string;
}

export interface Customer {
  id: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  observation?: string;
  contacts: CustomerContact[];
  tags: string[];
  status: CustomerStatus;
  source: CustomerSource;
  blacklistReason?: string;
  nextFollowUpAt?: string;
  fiscal?: CustomerFiscal;
  /** 360 summary strip (07 §3) — "—" until 06/09 wire real figures. */
  lastServiceDate?: string;
  totalJobs?: number;
  totalBilled?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** `GET /customers/all` (21 §3) — one entry of the whole live roster, the
 *  unpaged read every customer picker uses. A projection of `Customer`, not the
 *  full row: the roster is the one customer read with no page and no limit, so
 *  it carries only what a picker renders. Nullable columns arrive as `null`,
 *  not absent — this is the raw row projection, no DTO layer in between. */
export interface CustomerOption {
  id: string;
  name: string;
  contactName: string | null;
  razonSocial: string | null;
  identification: string | null;
  phone: string | null;
  email: string | null;
  state: string | null;
  status: CustomerStatus;
  timezone: string;
}

export interface CustomerListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: CustomerStatus | '';
  source?: CustomerSource | '';
  tags?: string[];
}

export interface SaveCustomerRequest {
  name: string;
  address?: string;
  observation?: string;
  /** At least one; exactly one carries `isDefault`. The backend derives the
   *  customer's `contactName`/`phone`/`email` from the default contact. */
  contacts: CustomerContact[];
  tags: string[];
  status: CustomerStatus;
  source: CustomerSource;
  fiscal?: CustomerFiscal;
}

export interface DeleteCustomerRequest {
  deleteComment: string;
}
