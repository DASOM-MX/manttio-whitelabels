import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { PagedResponse } from '../../data/dtos/paged-response';
import type {
  Customer,
  CustomerListQuery,
  DeleteCustomerRequest,
  SaveCustomerRequest,
} from '../../data/dtos/customer';

@Injectable({ providedIn: 'root' })
export class CustomersService {
  private readonly remote = inject(RemoteService);

  list(query: CustomerListQuery): Observable<PagedResponse<Customer>> {
    return this.remote.get<PagedResponse<Customer>>('/customers', {
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
      source: query.source,
      tags: query.tags?.length ? query.tags.join(',') : undefined,
    });
  }

  get(id: string): Observable<Customer> {
    return this.remote.get<Customer>(`/customers/${id}`);
  }

  create(body: SaveCustomerRequest): Observable<Customer> {
    return this.remote.post<Customer>('/customers', body);
  }

  update(id: string, body: SaveCustomerRequest): Observable<Customer> {
    return this.remote.patch<Customer>(`/customers/${id}`, body);
  }

  remove(id: string, body: DeleteCustomerRequest): Observable<void> {
    return this.remote.delete<void>(`/customers/${id}`, body);
  }
}
