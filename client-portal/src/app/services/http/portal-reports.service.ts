import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { GenericQueryResponse } from '../../data/dtos/shared/generic-query-response.dto';
import type { PortalReportDetail } from '../../data/dtos/portal-report/portal-report-detail.dto';
import type { PortalReportListItem } from '../../data/dtos/portal-report/portal-report-list-item.dto';
import type { PortalReportsQuery } from '../../data/dtos/portal-report/portal-reports-query.dto';

@Injectable({ providedIn: 'root' })
export class PortalReportsService {
  private readonly remote = inject(RemoteService);

  list(query: PortalReportsQuery): Observable<GenericQueryResponse<PortalReportListItem>> {
    return this.remote.get<GenericQueryResponse<PortalReportListItem>>('/portal/reports', {
      page: query.page,
      limit: query.limit,
      search: query.search,
      equipmentId: query.equipmentId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  get(id: string): Observable<PortalReportDetail> {
    return this.remote.get<PortalReportDetail>(`/portal/reports/${id}`);
  }

  /** Every fetch is an audited download (04 §2b) — the backend appends a
   *  `report_events` row on each call, no first-download-only dedup. */
  downloadPdf(id: string): Observable<Blob> {
    return this.remote.getBlob(`/portal/reports/${id}/pdf`);
  }
}
