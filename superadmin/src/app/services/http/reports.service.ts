import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { PagedResponse } from '../../data/dtos/paged-response';
import type {
  DeleteReportRequest,
  ReportDetail,
  ReportListQuery,
  ReportSummary,
} from '../../data/dtos/report';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly remote = inject(RemoteService);

  list(query: ReportListQuery): Observable<PagedResponse<ReportSummary>> {
    return this.remote.get<PagedResponse<ReportSummary>>('/reports', {
      page: query.page,
      limit: query.limit,
      search: query.search,
      customerId: query.customerId,
      technicianId: query.technicianId,
      templateId: query.templateId,
      from: query.from,
      to: query.to,
      status: query.status,
    });
  }

  get(id: string): Observable<ReportDetail> {
    return this.remote.get<ReportDetail>(`/reports/${id}`);
  }

  pdf(id: string): Observable<Blob> {
    return this.remote.getBlob(`/reports/${id}/pdf`);
  }

  remove(id: string, body: DeleteReportRequest): Observable<void> {
    return this.remote.delete<void>(`/reports/${id}`, body);
  }
}
