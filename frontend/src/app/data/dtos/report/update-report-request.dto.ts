import type { ReportData } from './report-data.dto';

export interface UpdateReportRequest {
  work_type?: string;
  date_arrival?: string;
  date_departure?: string;
  client_id?: string;
  data?: Partial<ReportData>;
}
