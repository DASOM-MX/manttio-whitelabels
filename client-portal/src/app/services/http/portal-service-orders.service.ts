import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { GenericQueryResponse } from '../../data/dtos/shared/generic-query-response.dto';
import type { PortalServiceOrderDetail } from '../../data/dtos/portal-service-order/portal-service-order-detail.dto';
import type { PortalServiceOrderListItem } from '../../data/dtos/portal-service-order/portal-service-order-list-item.dto';
import type { PortalServiceOrdersQuery } from '../../data/dtos/portal-service-order/portal-service-orders-query.dto';

/** No download route (04 §6) — an order is a detail page, not a document. */
@Injectable({ providedIn: 'root' })
export class PortalServiceOrdersService {
  private readonly remote = inject(RemoteService);

  list(
    query: PortalServiceOrdersQuery,
  ): Observable<GenericQueryResponse<PortalServiceOrderListItem>> {
    return this.remote.get<GenericQueryResponse<PortalServiceOrderListItem>>(
      '/portal/service-orders',
      {
        page: query.page,
        limit: query.limit,
        search: query.search,
        status: query.status,
      },
    );
  }

  get(id: string): Observable<PortalServiceOrderDetail> {
    return this.remote.get<PortalServiceOrderDetail>(`/portal/service-orders/${id}`);
  }
}
