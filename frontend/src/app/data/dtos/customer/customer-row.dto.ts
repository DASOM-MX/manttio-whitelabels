export interface CustomerRow {
  id: string;
  name: string;
  identification: string | null;
  phone: string | null;
  email: string | null;
  observation: string | null;
  createdAt: string;
  updatedAt: string;
}
