import type { CustomerSource, CustomerStatus } from '../enums/customers.enum';

// Assembled response shape (plan 07 §1). The service composes this from the
// base customer row + its contacts + its 1:1 fiscal row. `fiscal` is null when
// the client has no fiscal data; referral links and the 360 summary figures
// (lastServiceDate/totalJobs/totalBilled) are deferred (06/09 + a later pass).

export interface CustomerContactDto {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
}

export interface CustomerFiscalDto {
  rfc: string;
  legalName: string;
  taxRegimeCode: string;
  fiscalZip: string;
  cfdiUseCode: string;
  billingEmail: string | null;
}

export interface CustomerDto {
  id: string;
  name: string;
  contactName: string | null;
  identification: string | null;
  phone: string | null;
  email: string | null;
  observation: string | null;
  address: string | null;
  state: string | null;
  razonSocial: string | null;
  timezone: string;
  status: CustomerStatus;
  source: CustomerSource;
  blacklistReason: string | null;
  nextFollowUpAt: string | null;
  tags: string[];
  fiscal: CustomerFiscalDto | null;
  contacts: CustomerContactDto[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
