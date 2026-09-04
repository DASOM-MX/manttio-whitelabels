import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { GenericQueryResponse } from '../../data/dtos/shared/generic-query-response.dto';
import type { PortalEquipmentDetail } from '../../data/dtos/portal-equipment/portal-equipment-detail.dto';
import type { PortalEquipmentListItem } from '../../data/dtos/portal-equipment/portal-equipment-list-item.dto';
import type { PortalEquipmentQuery } from '../../data/dtos/portal-equipment/portal-equipment-query.dto';

/** `GET /portal/equipment` also backs the future request-form picker (A8),
 *  guarded server-side by a disjunction of `view_equipment` /
 *  `create_service_requests` — this service and the browsable section that
 *  uses it are `view_equipment`-only; the picker is 06 CP-3's own consumer. */
@Injectable({ providedIn: 'root' })
export class PortalEquipmentService {
  private readonly remote = inject(RemoteService);

  list(query: PortalEquipmentQuery): Observable<GenericQueryResponse<PortalEquipmentListItem>> {
    return this.remote.get<GenericQueryResponse<PortalEquipmentListItem>>('/portal/equipment', {
      page: query.page,
      limit: query.limit,
      search: query.search,
      location: query.location,
    });
  }

  get(id: string): Observable<PortalEquipmentDetail> {
    return this.remote.get<PortalEquipmentDetail>(`/portal/equipment/${id}`);
  }
}
