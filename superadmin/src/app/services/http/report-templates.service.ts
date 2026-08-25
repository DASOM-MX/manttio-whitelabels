import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { GenericQueryResponse } from '../../data/dtos/generic-query-response';
import type {
  ReportTemplate,
  SaveTemplateRequest,
  TemplateListQuery,
} from '../../data/dtos/report-template';

/** Report-template builder API (06 §5.4) — separate from ReportsService.
 *  The field app calls the same list scoped `status=active`. */
@Injectable({ providedIn: 'root' })
export class ReportTemplatesService {
  private readonly remote = inject(RemoteService);

  list(query: TemplateListQuery = {}): Observable<GenericQueryResponse<ReportTemplate>> {
    return this.remote.get<GenericQueryResponse<ReportTemplate>>('/report-templates', {
      page: query.page,
      limit: query.limit,
      status: query.status,
    });
  }

  get(id: string): Observable<ReportTemplate> {
    return this.remote.get<ReportTemplate>(`/report-templates/${id}`);
  }

  create(body: SaveTemplateRequest): Observable<ReportTemplate> {
    return this.remote.post<ReportTemplate>('/report-templates', body);
  }

  /** Draft only — the backend rejects edits to active/disabled (06 §5.2). */
  update(id: string, body: SaveTemplateRequest): Observable<ReportTemplate> {
    return this.remote.patch<ReportTemplate>(`/report-templates/${id}`, body);
  }

  activate(id: string): Observable<ReportTemplate> {
    return this.remote.post<ReportTemplate>(`/report-templates/${id}/activate`, {});
  }

  /** active → draft: the edit path. */
  deactivate(id: string): Observable<ReportTemplate> {
    return this.remote.post<ReportTemplate>(`/report-templates/${id}/deactivate`, {});
  }

  /** Terminal; requires an audited reason. */
  disable(id: string, reason: string): Observable<ReportTemplate> {
    return this.remote.post<ReportTemplate>(`/report-templates/${id}/disable`, { reason });
  }
}
