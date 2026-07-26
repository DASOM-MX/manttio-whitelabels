import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type {
  DeleteServiceRequest,
  SaveServiceRequest,
  Service,
  ServiceListQuery,
} from '../../data/dtos/service';

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

  create(body: SaveServiceRequest): Observable<Service> {
    return this.remote.post<Service>('/services', body);
  }

  update(id: string, body: Partial<SaveServiceRequest>): Observable<Service> {
    return this.remote.patch<Service>(`/services/${id}`, body);
  }

  remove(id: string, body: DeleteServiceRequest): Observable<void> {
    return this.remote.delete<void>(`/services/${id}`, body);
  }
}
