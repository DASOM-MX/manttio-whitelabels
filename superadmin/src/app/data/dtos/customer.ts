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

export enum CustomerSource {
  Facebook = 'facebook',
  Google = 'google',
  Referral = 'referral',
  Website = 'website',
  Phonecall = 'phonecall',
  PersonalMeeting = 'personal_meeting',
  Other = 'other',
}

export interface CustomerContact {
  id?: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
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
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  contacts: CustomerContact[];
  tags: string[];
  status: CustomerStatus;
  source: CustomerSource;
  fiscal?: CustomerFiscal;
}

export interface DeleteCustomerRequest {
  deleteComment: string;
}
