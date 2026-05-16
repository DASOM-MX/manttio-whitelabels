import { Customer } from '../../../interfaces/customer';

export interface CustomersStateModel {
  items: Customer[];
  total: number;
  lastFetchedAt: number | null;
  loading: boolean;
}
