import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { GenericQueryResponse } from '../../data/dtos/shared/generic-query-response.dto';
import type { PortalContractDetail } from '../../data/dtos/portal-contract/portal-contract-detail.dto';
import type { PortalContractListItem } from '../../data/dtos/portal-contract/portal-contract-list-item.dto';
import type { PortalContractsQuery } from '../../data/dtos/portal-contract/portal-contracts-query.dto';

@Injectable({ providedIn: 'root' })
export class PortalContractsService {
  private readonly remote = inject(RemoteService);

  list(query: PortalContractsQuery): Observable<GenericQueryResponse<PortalContractListItem>> {
    return this.remote.get<GenericQueryResponse<PortalContractListItem>>('/portal/contracts', {
      page: query.page,
      limit: query.limit,
      search: query.search,
      type: query.type,
      validity: query.validity,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  get(id: string): Observable<PortalContractDetail> {
    return this.remote.get<PortalContractDetail>(`/portal/contracts/${id}`);
  }

  /** Named `/pdf` for the common case, but the stored file is not always one
   *  (04 §4) — the response carries its own content-type, which `getBlob`'s
   *  underlying request already reads into the returned `Blob`. Every fetch
   *  is an audited download (04 §2b), the backend's concern. */
  downloadFile(id: string): Observable<Blob> {
    return this.remote.getBlob(`/portal/contracts/${id}/pdf`);
  }
}
