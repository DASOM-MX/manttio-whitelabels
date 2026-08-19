import type { ReportRow } from './report-row.dto';

export interface ReportListResponse {
  items: ReportRow[];
  total: number;
  page: number;
  limit: number;
}
