import type { WorkType } from '../../types/report';
import type { ReportCapture } from './report-capture.dto';

export interface CreateReportFields {
  report_type: string;
  work_type?: WorkType;
  client_id: string;
  date_arrival?: string;
  date_departure?: string;
  assigned_to?: string;
  /** Original creator (user id). Sent when syncing an offline report so the server
   *  attributes it to the tech who created it, not the uploader. */
  created_by?: string;
  signed_by?: string;
  data: ReportCapture;
  pictures?: File[];
  signature?: File;
  signature_base64?: string;
  signed_latitude?: number;
  signed_longitude?: number;
  signed_accuracy?: number | null;
}
