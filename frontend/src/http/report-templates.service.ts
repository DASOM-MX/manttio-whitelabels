import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RemoteService } from './remote.service';
import type { ReportTemplate } from '../app/data/types/report-template/report-template.types';
import type { GenericQueryResponse } from '../app/data/dtos/generic-query-response.dto';

export interface ReportTemplateQuery extends Record<string, string | number | boolean | undefined | null> {
  status?: 'active' | 'draft' | 'disabled';
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class ReportTemplatesService {
  private readonly remote = inject(RemoteService);

  list(query?: ReportTemplateQuery): Observable<GenericQueryResponse<ReportTemplate>> {
    return this.remote.get<GenericQueryResponse<ReportTemplate>>('/report-templates', query);
  }

  get(id: string): Observable<ReportTemplate> {
    return this.remote.get<ReportTemplate>(`/report-templates/${id}`);
  }
}
