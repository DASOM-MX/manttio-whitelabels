import type { ReportType, WorkType } from '../../types/report';
import type { ReportData } from './report-data.dto';

export interface CreateReportFields {
  report_type: ReportType;
  work_type?: WorkType;
  client_id: string;
  date_arrival?: string;
  date_departure?: string;
  assigned_to?: string;
  signed_by?: string;
  data: ReportData;
  pictures?: File[];
  signature?: File;
  signature_base64?: string;
  signed_latitude?: number;
  signed_longitude?: number;
  signed_accuracy?: number | null;
}
