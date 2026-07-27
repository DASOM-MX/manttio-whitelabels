import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { PagedResponse } from '../../data/dtos/paged-response';
import type {
  CreateServiceOrderRequest,
  ServiceOrder,
  ServiceOrderDetail,
  ServiceOrderEvent,
  ServiceOrderListQuery,
  ServiceOrderReport,
  SetServiceOrderStatusRequest,
  UpdateServiceOrderRequest,
} from '../../data/dtos/service-order';

@Injectable({ providedIn: 'root' })
export class ServiceOrdersService {
  private readonly remote = inject(RemoteService);

  list(query: ServiceOrderListQuery): Observable<PagedResponse<ServiceOrder>> {
    return this.remote.get<PagedResponse<ServiceOrder>>('/service-orders', {
      page: query.page,
      limit: query.limit,
      q: query.q,
      customerId: query.customerId,
      status: query.status || undefined,
    });
  }

  get(id: string): Observable<{ order: ServiceOrderDetail }> {
    return this.remote.get<{ order: ServiceOrderDetail }>(`/service-orders/${id}`);
  }

  /** The exploded reports — lazy-loaded by the order view's card (19 §4). */
  reports(id: string): Observable<{ reports: ServiceOrderReport[] }> {
    return this.remote.get<{ reports: ServiceOrderReport[] }>(`/service-orders/${id}/reports`);
  }

  /** Paged newest-first activity feed (19 §7). */
  timeline(id: string, page: number, limit: number): Observable<PagedResponse<ServiceOrderEvent>> {
    return this.remote.get<PagedResponse<ServiceOrderEvent>>(`/service-orders/${id}/timeline`, {
      page,
      limit,
    });
  }

  create(body: CreateServiceOrderRequest): Observable<{ order: ServiceOrderDetail }> {
    return this.remote.post<{ order: ServiceOrderDetail }>('/service-orders', body);
  }

  update(id: string, body: UpdateServiceOrderRequest): Observable<{ order: ServiceOrderDetail }> {
    return this.remote.patch<{ order: ServiceOrderDetail }>(`/service-orders/${id}`, body);
  }

  setStatus(id: string, body: SetServiceOrderStatusRequest): Observable<{ order: ServiceOrderDetail }> {
    return this.remote.post<{ order: ServiceOrderDetail }>(`/service-orders/${id}/status`, body);
  }
}
