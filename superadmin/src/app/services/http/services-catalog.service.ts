import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  DeleteServiceRequest,
  SaveServiceRequest,
  Service,
  ServiceEvent,
  ServiceListQuery,
} from '../../data/dtos/service';
import type { ServiceImportRow } from '../../data/types/services/service-import';

/** Named `services-catalog` rather than `services.service` to dodge the
 *  stutter (18 §5) — `app/services/http/` already means "injectables". */
@Injectable({ providedIn: 'root' })
export class ServicesCatalogService {
  private readonly remote = inject(RemoteService);

  /** The whole active catalog, name-sorted — no pagination (18 §4). */
  list(query: ServiceListQuery): Observable<{ services: Service[] }> {
    return this.remote.get<{ services: Service[] }>('/services', { q: query.q });
  }

  get(id: string): Observable<Service> {
    return this.remote.get<Service>(`/services/${id}`);
  }

  /** The append-only trail (18 §6.1). Admin tier — the API 403s office and
   *  technician, so callers gate on role before asking. */
  timeline(id: string): Observable<ServiceEvent[]> {
    return this.remote.get<ServiceEvent[]>(`/services/${id}/timeline`);
  }

  create(body: SaveServiceRequest): Observable<Service> {
    return this.remote.post<Service>('/services', body);
  }

  /** CSV import (18 §6.3) — all-or-nothing on the server: a 422 names each
   *  failing row, a 201 means every row landed. */
  importRows(rows: ServiceImportRow[]): Observable<{ imported: number }> {
    return this.remote.post<{ imported: number }>('/services/import', { rows });
  }

  update(id: string, body: Partial<SaveServiceRequest>): Observable<Service> {
    return this.remote.patch<Service>(`/services/${id}`, body);
  }

  remove(id: string, body: DeleteServiceRequest): Observable<void> {
    return this.remote.delete<void>(`/services/${id}`, body);
  }
}
