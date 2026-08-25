import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  CreateCustomerRequest, UpdateCustomerRequest,
  CustomerResponse, DeleteCustomerResponse,
} from '../app/data/dtos/customer';
import type { CustomerOption } from '../app/data/dtos/customer/customer-option.dto';

@Injectable({ providedIn: 'root' })
export class CustomersService {
  private readonly remote = inject(RemoteService);

  /** The whole live roster (21 §3), name-sorted. Deliberately the roster route
   *  and not `GET /customers`: that one becomes paged in CP-4, and this app
   *  needs every client at once — the directory paginates client-side and the
   *  offline queue resolves names against a complete list. */
  list(): Observable<{ items: CustomerOption[] }> {
    return this.remote.get<{ items: CustomerOption[] }>('/customers/all');
  }
  get(id: string): Observable<CustomerResponse> {
    return this.remote.get<CustomerResponse>(`/customers/${id}`);
  }
  create(body: CreateCustomerRequest): Observable<CustomerResponse> {
    return this.remote.post<CustomerResponse>('/customers', body);
  }
  update(id: string, body: UpdateCustomerRequest): Observable<CustomerResponse> {
    return this.remote.patch<CustomerResponse>(`/customers/${id}`, body);
  }
  remove(id: string): Observable<DeleteCustomerResponse> {
    return this.remote.delete<DeleteCustomerResponse>(`/customers/${id}`);
  }
}
