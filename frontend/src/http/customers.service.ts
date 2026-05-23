import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  CreateCustomerRequest, UpdateCustomerRequest,
  CustomerResponse, CustomerListResponse, DeleteCustomerResponse,
} from '../app/data/dtos/customer';

@Injectable({ providedIn: 'root' })
export class CustomersService {
  private readonly remote = inject(RemoteService);

  list(): Observable<CustomerListResponse> {
    return this.remote.get<CustomerListResponse>('/customers');
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
