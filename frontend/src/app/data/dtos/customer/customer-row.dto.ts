export interface CustomerRow {
  id: string;
  name: string;
  identification: string | null;
  phone: string | null;
  email: string | null;
  observation: string | null;
  address: string | null;
  state: string | null;
  razonSocial: string | null;
  /** IANA timezone (Mexican). Drives date/time rendering for any report on this customer. */
  timezone: string;
  createdAt: string;
  updatedAt: string;
}
