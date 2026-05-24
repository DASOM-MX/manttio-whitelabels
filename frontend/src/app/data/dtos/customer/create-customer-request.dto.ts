export interface CreateCustomerRequest {
  name: string;
  identification?: string;
  phone?: string;
  email?: string;
  observation?: string;
  address?: string;
  state?: string;
  razonSocial?: string;
}
