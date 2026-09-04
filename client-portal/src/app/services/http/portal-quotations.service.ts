import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { GenericQueryResponse } from '../../data/dtos/shared/generic-query-response.dto';
import type { PortalQuotationDetail } from '../../data/dtos/portal-quotation/portal-quotation-detail.dto';
import type { PortalQuotationListItem } from '../../data/dtos/portal-quotation/portal-quotation-list-item.dto';
import type { PortalQuotationsQuery } from '../../data/dtos/portal-quotation/portal-quotations-query.dto';

@Injectable({ providedIn: 'root' })
export class PortalQuotationsService {
  private readonly remote = inject(RemoteService);

  list(query: PortalQuotationsQuery): Observable<GenericQueryResponse<PortalQuotationListItem>> {
    return this.remote.get<GenericQueryResponse<PortalQuotationListItem>>('/portal/quotations', {
      page: query.page,
      limit: query.limit,
      search: query.search,
      status: query.status,
    });
  }

  get(id: string): Observable<PortalQuotationDetail> {
    return this.remote.get<PortalQuotationDetail>(`/portal/quotations/${id}`);
  }

  /** The same document the send attaches (04 §5). Every fetch is an audited
   *  download (04 §2b) — recorded against the contact, not the portal user,
   *  because `quotation_events` also serves the emailed token page. Purely
   *  server-side bookkeeping; nothing for this service to do differently. */
  downloadPdf(id: string): Observable<Blob> {
    return this.remote.getBlob(`/portal/quotations/${id}/pdf`);
  }
}
