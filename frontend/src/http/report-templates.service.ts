import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { ReportTemplate, ReportTemplateListResponse } from '../app/data/types/report-template/report-template.types';

export interface ReportTemplateQuery extends Record<string, string | number | boolean | undefined | null> {
  status?: 'active' | 'draft' | 'disabled';
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class ReportTemplatesService {
  private readonly remote = inject(RemoteService);

  list(query?: ReportTemplateQuery): Observable<ReportTemplateListResponse> {
    return this.remote.get<ReportTemplateListResponse>('/report-templates', query);
  }

  get(id: string): Observable<ReportTemplate> {
    return this.remote.get<ReportTemplate>(`/report-templates/${id}`);
  }
}
