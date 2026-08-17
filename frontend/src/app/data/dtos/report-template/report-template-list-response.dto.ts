import type { ReportTemplate } from '../../types/report-template/report-template.types';

export interface ReportTemplateListResponse {
  items: ReportTemplate[];
  total: number;
}
