import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RemoteService } from './remote.service';
import type {
  CreateCustomerRequest, UpdateCustomerRequest,
  CustomerResponse, CustomerListResponse, DeleteCustomerResponse,
} from '../app/data/dtos/customer';
import type { CustomerRow } from '../app/data/dtos/customer/customer-row.dto';

// The backend now speaks the superadmin envelope (list → { items, ... }, single
// → bare entity). This legacy app keeps its own { customers }/{ customer } DTOs,
// so we adapt at the http-service edge rather than churn the state layer.
@Injectable({ providedIn: 'root' })
export class CustomersService {
  private readonly remote = inject(RemoteService);

  list(): Observable<CustomerListResponse> {
    return this.remote
      .get<{ items: CustomerRow[] }>('/customers')
      .pipe(map((res) => ({ customers: res.items })));
  }
  get(id: string): Observable<CustomerResponse> {
    return this.remote
      .get<CustomerRow>(`/customers/${id}`)
      .pipe(map((customer) => ({ customer })));
  }
  create(body: CreateCustomerRequest): Observable<CustomerResponse> {
    return this.remote
      .post<CustomerRow>('/customers', body)
      .pipe(map((customer) => ({ customer })));
  }
  update(id: string, body: UpdateCustomerRequest): Observable<CustomerResponse> {
    return this.remote
      .patch<CustomerRow>(`/customers/${id}`, body)
      .pipe(map((customer) => ({ customer })));
  }
  remove(id: string): Observable<DeleteCustomerResponse> {
    return this.remote.delete<DeleteCustomerResponse>(`/customers/${id}`);
  }
}
