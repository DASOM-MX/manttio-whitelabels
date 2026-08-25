import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { GenericQueryResponse } from '../../data/dtos/generic-query-response';
import type {
  DeleteEquipmentRequest,
  Equipment,
  EquipmentListQuery,
  EquipmentReportLink,
  SaveEquipmentRequest,
} from '../../data/dtos/equipment';

@Injectable({ providedIn: 'root' })
export class EquipmentService {
  private readonly remote = inject(RemoteService);

  list(query: EquipmentListQuery): Observable<GenericQueryResponse<Equipment>> {
    return this.remote.get<GenericQueryResponse<Equipment>>('/equipment', {
      page: query.page,
      limit: query.limit,
      search: query.search,
      customerId: query.customerId,
      status: query.status,
    });
  }

  /** The common read path — the customer-view equipment card. */
  byCustomer(customerId: string): Observable<Equipment[]> {
    return this.remote.get<Equipment[]>(`/customers/${customerId}/equipment`);
  }

  get(id: string): Observable<Equipment> {
    return this.remote.get<Equipment>(`/equipment/${id}`);
  }

  create(body: SaveEquipmentRequest): Observable<Equipment> {
    return this.remote.post<Equipment>('/equipment', body);
  }

  update(
    id: string,
    body: Partial<SaveEquipmentRequest> & { status?: string },
  ): Observable<Equipment> {
    return this.remote.patch<Equipment>(`/equipment/${id}`, body);
  }

  /** Retro-link (idempotent): equipment id in the path, report id in the body. */
  linkReport(id: string, reportId: string): Observable<Equipment> {
    return this.remote.put<Equipment>(`/equipment/${id}/reports`, { reportId });
  }

  unlinkReport(id: string, reportId: string): Observable<Equipment> {
    return this.remote.delete<Equipment>(`/equipment/${id}/reports/${reportId}`);
  }

  remove(id: string, body: DeleteEquipmentRequest): Observable<void> {
    return this.remote.delete<void>(`/equipment/${id}`, body);
  }

  /** Retro-link candidates: the client's reports (the same customer-scoped read
   *  the "Servicios" tab uses — GET /customers/:id/reports, newest first). */
  reportOptions(customerId: string): Observable<EquipmentReportLink[]> {
    return this.remote.get<EquipmentReportLink[]>(`/customers/${customerId}/reports`);
  }
}
