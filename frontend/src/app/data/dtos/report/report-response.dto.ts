import type { ReportRow } from './report-row.dto';
import type { ReportDetailRow } from './report-detail-row.dto';

export interface ReportResponse {
  report: ReportRow;
  details: ReportDetailRow;
}
