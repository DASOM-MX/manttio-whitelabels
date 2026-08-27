import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, reduce, type Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { GenericQueryResponse } from '../../data/dtos/generic-query-response';
import type {
  DeleteServiceRequest,
  SaveServiceRequest,
  Service,
  ServiceEvent,
  ServiceListQuery,
  ServiceOption,
} from '../../data/dtos/service';
import type { ServiceImportRow } from '../../data/types/services/service-import';

/** The server's `limit` cap (`listServicesQuerySchema`). `listAll` walks in
 *  the largest pages the API allows, so a normal catalog is one request. */
const MAX_PAGE_SIZE = 100;

/** Named `services-catalog` rather than `services.service` to dodge the
 *  stutter (18 §5) — `app/services/http/` already means "injectables". */
@Injectable({ providedIn: 'root' })
export class ServicesCatalogService {
  private readonly remote = inject(RemoteService);

  /** The whole active catalog, name-sorted — what every service *picker*
   *  reads (21 §3). Separate from `list()`: `list()` is the catalog browse, and
   *  since CP-5 paged it a picker riding that route would silently see one
   *  page. Not a `GenericQueryResponse` — a roster has no page. */
  listOptions(): Observable<ServiceOption[]> {
    return this.remote.get<ServiceOption[]>('/services/all');
  }

  /** One page of the catalog browse (21 CP-5). */
  list(query: ServiceListQuery): Observable<GenericQueryResponse<Service>> {
    return this.remote.get<GenericQueryResponse<Service>>('/services', {
      page: query.page,
      limit: query.limit,
      q: query.q,
    });
  }

  /** Every row matching a filter, walked page by page (21 CP-5).
   *
   *  The CSV export needs the whole result set and `list()` now returns one
   *  page — exporting the rows on screen would have quietly produced a ten-row
   *  file, the same silent truncation this plan exists to prevent. The roster
   *  (`/services/all`) cannot serve it either: the export carries description,
   *  website copy and the SAT codes, none of which a picker projection has.
   *  Bounded by the server's own `total`, so it stops rather than looping. */
  listAll(query: ServiceListQuery): Observable<Service[]> {
    const page = (n: number) => this.list({ ...query, page: n, limit: MAX_PAGE_SIZE });
    return page(1).pipe(
      expand((res) => (res.page * res.limit < res.total ? page(res.page + 1) : EMPTY)),
      reduce((all, res) => all.concat(res.items), [] as Service[]),
    );
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
