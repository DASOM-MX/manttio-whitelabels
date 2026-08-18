import type { ReportCapture } from './report-capture.dto';
import type { WorkType } from '../../types/report';

export interface UpdateReportRequest {
  work_type?: WorkType;
  date_arrival?: string;
  date_departure?: string;
  client_id?: string;
  data?: Partial<ReportCapture>;
}
