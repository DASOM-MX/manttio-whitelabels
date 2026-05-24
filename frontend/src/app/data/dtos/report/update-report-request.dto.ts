import type { ReportData } from './report-data.dto';
import type { WorkType } from '../../types/report';

export interface UpdateReportRequest {
  work_type?: WorkType;
  date_arrival?: string;
  date_departure?: string;
  client_id?: string;
  data?: Partial<ReportData>;
}
